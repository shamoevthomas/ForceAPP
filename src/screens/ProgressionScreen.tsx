import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, FlatList, Switch,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import * as Notifications from '../services/NotificationService';
import { SPACING, BORDER_RADIUS } from '../constants/theme';
import { Exercise, ProgramDayWithExercises, WorkoutLog, WorkoutSet } from '../types';

// ─── Week Helpers ────────────────────────────────────────────────
function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getStartOfWeek(week: number, year: number): Date {
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    return ISOweekStart;
}

function getDatesForTwoWeeks(week: number, year: number): Date[] {
    const start = getStartOfWeek(week, year);
    return Array.from({ length: 14 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
    });
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isToday(date: Date): boolean {
    const today = new Date();
    return formatDate(date) === formatDate(today);
}

// ─── Deterministic Randomness ────────────────────────────────────
function getFailureExId(userId: string, dateStr: string, exerciseIds: string[]): string | null {
    if (!exerciseIds.length) return null;
    const seedStr = `${userId}-${dateStr}`;
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
        hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
        hash |= 0;
    }
    const absHash = Math.abs(hash);
    // 25% chance of a failure day (~1-2 times per week)
    if (absHash % 100 < 25) {
        return exerciseIds[absHash % exerciseIds.length];
    }
    return null;
}

// ─── Progressive Overload Logic ──────────────────────────────────
function calculateNextWeight(lastWeight: number, increment: number, targetSets: number, targetReps: number, completedSets: WorkoutSet[]): number {
    const allSetsCompleted = completedSets.length >= targetSets;
    const allRepsHit = completedSets.every(s => (s.reps || 0) >= targetReps);
    if (allSetsCompleted && allRepsHit) {
        return lastWeight + increment;
    }
    return lastWeight;
}

export default function ProgressionScreen() {
    const { user, profile } = useAuth();
    const { colors, isDark } = useTheme();
    const styles = createStyles(colors);

    // Current selection state
    const now = new Date();
    const [currentYear, setCurrentYear] = useState(now.getFullYear());
    const [currentWeek, setCurrentWeek] = useState(getWeekNumber(now));
    const [selectedDate, setSelectedDate] = useState(now);

    // UI state
    const [calendarVisible, setCalendarVisible] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Data state
    const [programDays, setProgramDays] = useState<ProgramDayWithExercises[]>([]);
    const [activeProgramDay, setActiveProgramDay] = useState<ProgramDayWithExercises | null>(null);
    const [workoutLog, setWorkoutLog] = useState<WorkoutLog | null>(null);
    const [sets, setSets] = useState<Map<string, { weight: string; reps: string; isAmrap: boolean }[]>>(new Map());
    const [isSkipped, setIsSkipped] = useState(false);
    const [savedRecently, setSavedRecently] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [exportPeriodType, setExportPeriodType] = useState<'weeks' | 'months'>('weeks');
    const [exportAmount, setExportAmount] = useState(4);
    const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
    const [exporting, setExporting] = useState(false);
    const isSavingRef = useRef(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDirtyRef = useRef(false);
    const handleSaveRef = useRef<(skippedOverride?: boolean, updateLocalState?: boolean) => Promise<void>>(async () => {});

    const datesToDisplay = useMemo(() => getDatesForTwoWeeks(currentWeek, currentYear), [currentWeek, currentYear]);

    // Fetch Program
    const fetchProgram = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('programs')
            .select(`
                id,
                program_days (
                    id, day_number, day_label,
                    exercises (
                        id, name, target_sets, target_reps,
                        current_weight_kg, weight_increment, sort_order
                    )
                )
            `)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (data?.program_days) {
            const sorted = (data.program_days as ProgramDayWithExercises[]).map(day => ({
                ...day,
                exercises: day.exercises.sort((a, b) => a.sort_order - b.sort_order),
            }));
            setProgramDays(sorted);
            return sorted;
        }
        return [];
    }, [user]);

    const fetchWorkout = useCallback(async (date: Date, allProgramDays: ProgramDayWithExercises[]) => {
        if (!user) return;
        isDirtyRef.current = false;
        setLoading(true);
        const dateStr = formatDate(date);
        const dayOfWeek = date.getDay() || 7;

        const matchedDay = allProgramDays.find(d => d.day_number === dayOfWeek);
        setActiveProgramDay(matchedDay || null);
        setIsSkipped(false);

        if (!matchedDay) {
            setWorkoutLog(null);
            setSets(new Map());
            setLoading(false);
            return;
        }

        let { data: log } = await supabase
            .from('workout_logs')
            .select('*, workout_sets(*)')
            .eq('user_id', user.id)
            .eq('workout_date', dateStr)
            .eq('program_day_id', matchedDay.id)
            .maybeSingle();

        const setsMap = new Map<string, { weight: string; reps: string; isAmrap: boolean }[]>();
        const failureExId = getFailureExId(user.id, dateStr, matchedDay.exercises.map(e => e.id));

        if (log) {
            setWorkoutLog(log);
            setIsSkipped(log.is_skipped || false);
            for (const ex of matchedDay.exercises) {
                const exSets = (log.workout_sets as WorkoutSet[])
                    .filter(s => s.exercise_id === ex.id)
                    .sort((a, b) => a.set_number - b.set_number);

                if (exSets.length > 0) {
                    setsMap.set(ex.id, exSets.map(s => ({
                        weight: s.weight_kg?.toString() || '',
                        reps: s.reps?.toString() || '',
                        isAmrap: s.is_amrap || false,
                    })));
                } else {
                    setsMap.set(ex.id, generateDefaultSets(ex, ex.id === failureExId));
                }
            }
        } else {
            setWorkoutLog(null);
            for (const ex of matchedDay.exercises) {
                // 1. Find the latest log ID that contains this exercise for this user
                const { data: latestLog } = await supabase
                    .from('workout_logs')
                    .select('id, workout_date')
                    .eq('user_id', user.id)
                    .eq('program_day_id', matchedDay.id)
                    .eq('completed', true)
                    .lte('workout_date', formatDate(new Date())) // Don't look at future logs
                    .order('workout_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (latestLog) {
                    // 2. Fetch all sets from THAT SPECIFIC log for this exercise
                    const { data: lastSets } = await supabase
                        .from('workout_sets')
                        .select('*')
                        .eq('workout_log_id', latestLog.id)
                        .eq('exercise_id', ex.id)
                        .order('set_number', { ascending: true });

                    if (lastSets && lastSets.length > 0) {
                        const lastWeight = lastSets[0].weight_kg || 0;
                        const nextWeight = calculateNextWeight(
                            lastWeight,
                            parseFloat(ex.weight_increment),
                            ex.target_sets,
                            ex.target_reps,
                            lastSets as WorkoutSet[]
                        );
                        setsMap.set(ex.id, Array.from({ length: ex.target_sets }, (_, idx) => ({
                            weight: nextWeight.toString(),
                            reps: '',
                            isAmrap: ex.id === failureExId && (idx === ex.target_sets - 1),
                        })));
                    } else {
                        setsMap.set(ex.id, generateDefaultSets(ex, ex.id === failureExId));
                    }
                } else {
                    setsMap.set(ex.id, generateDefaultSets(ex, ex.id === failureExId));
                }
            }
        }
        setSets(setsMap);
        setLoading(false);
    }, [user]);

    const generateDefaultSets = (ex: Exercise, isAmrapLastSet: boolean = false) => {
        return Array.from({ length: ex.target_sets }, (_, idx) => ({
            weight: ex.current_weight_kg.toString(),
            reps: '',
            isAmrap: isAmrapLastSet && (idx === ex.target_sets - 1),
        }));
    };

    const loadAll = useCallback(async () => {
        const days = await fetchProgram();
        if (days) {
            await fetchWorkout(selectedDate, days);
        }
    }, [fetchProgram, fetchWorkout, selectedDate]);

    useFocusEffect(
        useCallback(() => {
            loadAll();
            return () => {
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                if (isDirtyRef.current) handleSaveRef.current(undefined, false);
            };
        }, [loadAll])
    );

    const handleDateSelect = (date: Date) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (isDirtyRef.current) handleSaveRef.current(undefined, false);
        setSelectedDate(date);
        fetchWorkout(date, programDays);
    };

    const handleWeekSelect = (week: number, year: number) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        if (isDirtyRef.current) handleSaveRef.current(undefined, false);
        setCurrentWeek(week);
        setCurrentYear(year);
        const start = getStartOfWeek(week, year);
        setSelectedDate(start);
        fetchWorkout(start, programDays);
        setCalendarVisible(false);
    };

    const handlePaste = (exerciseId: string, setIndex: number) => {
        if (setIndex === 0) return;
        isDirtyRef.current = true;
        const newSets = new Map(sets);
        const exSets = [...(newSets.get(exerciseId) || [])];
        const prevSet = exSets[setIndex - 1];
        if (prevSet) {
            exSets[setIndex] = { ...exSets[setIndex], weight: prevSet.weight, reps: prevSet.reps };
            newSets.set(exerciseId, exSets);
            setSets(newSets);
        }
    };

    const toggleAmrap = (exerciseId: string, setIndex: number) => {
        isDirtyRef.current = true;
        const newSets = new Map(sets);
        const exSets = [...(newSets.get(exerciseId) || [])];
        exSets[setIndex] = { ...exSets[setIndex], isAmrap: !exSets[setIndex].isAmrap };
        newSets.set(exerciseId, exSets);
        setSets(newSets);
    };

    const updateSet = (exerciseId: string, setIndex: number, field: string, value: string) => {
        isDirtyRef.current = true;
        const newSets = new Map(sets);
        const exSets = [...(newSets.get(exerciseId) || [])];
        exSets[setIndex] = { ...exSets[setIndex], [field]: value };
        newSets.set(exerciseId, exSets);
        setSets(newSets);
    };

    const handleSave = async (skippedOverride?: boolean, updateLocalState = true) => {
        if (!user || !activeProgramDay || isSavingRef.current) return;
        isSavingRef.current = true;
        setSaving(true);
        const effectiveSkipped = skippedOverride !== undefined ? skippedOverride : isSkipped;
        try {
            const dateStr = formatDate(selectedDate);
            let logId;
            if (workoutLog) {
                const { data, error } = await supabase
                    .from('workout_logs')
                    .update({ completed: !effectiveSkipped, is_skipped: effectiveSkipped })
                    .eq('id', workoutLog.id)
                    .select().single();
                if (error) throw error;
                logId = data.id;
                await supabase.from('workout_sets').delete().eq('workout_log_id', logId);
            } else {
                const { data, error } = await supabase
                    .from('workout_logs')
                    .insert({
                        user_id: user.id,
                        program_day_id: activeProgramDay.id,
                        workout_date: dateStr,
                        completed: !effectiveSkipped,
                        is_skipped: effectiveSkipped,
                    })
                    .select().single();
                if (error) throw error;
                logId = data.id;
                if (updateLocalState) setWorkoutLog(data as WorkoutLog);
            }

            if (!effectiveSkipped) {
                const allSetsArr: any[] = [];
                sets.forEach((exSets, exerciseId) => {
                    exSets.forEach((s, idx) => {
                        if (s.weight || s.reps) {
                            allSetsArr.push({
                                workout_log_id: logId,
                                exercise_id: exerciseId,
                                set_number: idx + 1,
                                weight_kg: parseFloat(s.weight) || 0,
                                reps: parseInt(s.reps) || 0,
                                is_amrap: s.isAmrap
                            });
                        }
                    });
                });
                if (allSetsArr.length > 0) {
                    await supabase.from('workout_sets').insert(allSetsArr);
                }
            }

            await supabase.rpc('calculate_streak', { p_user_id: user.id });
            await supabase.rpc('calculate_force_grade', { p_user_id: user.id });
            Notifications.scheduleDailyReminders(user, profile).catch(console.error);

            const weightUpdates: Promise<any>[] = [];
            const isFuture = formatDate(selectedDate) > formatDate(new Date());
            if (!effectiveSkipped && !isFuture) {
                sets.forEach((exSets, exerciseId) => {
                    for (let i = exSets.length - 1; i >= 0; i--) {
                        const s = exSets[i];
                        const repsAchieved = parseInt(s.reps) || 0;
                        const weightUsed = parseFloat(s.weight) || 0;
                        const targetReps = activeProgramDay.exercises.find(e => e.id === exerciseId)?.target_reps || 12;
                        if (weightUsed > 0 && repsAchieved >= (targetReps - 1)) {
                            const up = supabase
                                .from('exercises')
                                .update({ current_weight_kg: weightUsed })
                                .eq('id', exerciseId);
                            weightUpdates.push(Promise.resolve(up));
                            break;
                        }
                    }
                });
            }
            if (weightUpdates.length > 0) await Promise.all(weightUpdates);

            isDirtyRef.current = false;
            if (updateLocalState) {
                setSavedRecently(true);
                setTimeout(() => setSavedRecently(false), 2000);
            }
        } catch (err: any) {
            Alert.alert('Erreur', err.message);
        } finally {
            setSaving(false);
            isSavingRef.current = false;
        }
    };
    handleSaveRef.current = handleSave;

    const triggerAutoSave = () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => handleSave(), 300);
    };

    // ─── Export ───────────────────────────────────────────────────
    const getExportDateRange = () => {
        const end = new Date();
        const start = new Date();
        if (exportPeriodType === 'weeks') {
            start.setDate(start.getDate() - exportAmount * 7);
        } else {
            start.setMonth(start.getMonth() - exportAmount);
        }
        return { start, end };
    };

    const fetchExportData = async (start: Date, end: Date) => {
        const { data, error } = await supabase
            .from('workout_logs')
            .select(`
                workout_date, completed, is_skipped,
                program_days(day_label),
                workout_sets(
                    set_number, weight_kg, reps, is_amrap,
                    exercises(name)
                )
            `)
            .eq('user_id', user!.id)
            .gte('workout_date', formatDate(start))
            .lte('workout_date', formatDate(end))
            .order('workout_date', { ascending: true });
        if (error) throw error;
        return data || [];
    };

    const generateCSV = (logs: any[]) => {
        const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = ['Date,Séance,Exercice,Série,Poids (kg),Répétitions,AMRAP,Sauté'];
        for (const log of logs) {
            const date = log.workout_date;
            const seance = log.program_days?.day_label || '';
            if (log.is_skipped) {
                lines.push([date, escape(seance), escape('Séance sautée'), '', '', '', '', 'Oui'].join(','));
            } else {
                const sorted = [...(log.workout_sets || [])].sort((a: any, b: any) => a.set_number - b.set_number);
                if (!sorted.length) {
                    lines.push([date, escape(seance), escape('(aucune série)'), '', '', '', '', 'Non'].join(','));
                } else {
                    for (const s of sorted) {
                        lines.push([date, escape(seance), escape(s.exercises?.name || ''), s.set_number, s.weight_kg ?? '', s.reps ?? '', s.is_amrap ? 'Oui' : 'Non', 'Non'].join(','));
                    }
                }
            }
        }
        return '﻿' + lines.join('\n');
    };

    const generateHTML = (logs: any[], start: Date, end: Date) => {
        let rows = '';
        for (const log of logs) {
            const d = log.workout_date;
            const s = (log.program_days?.day_label || '—').replace(/</g, '&lt;');
            if (log.is_skipped) {
                rows += `<tr style="color:#aaa;font-style:italic"><td>${d}</td><td>${s}</td><td colspan="4">😴 Séance sautée</td></tr>`;
            } else {
                const sorted = [...(log.workout_sets || [])].sort((a: any, b: any) => a.set_number - b.set_number);
                if (!sorted.length) {
                    rows += `<tr><td>${d}</td><td>${s}</td><td colspan="4" style="color:#aaa">Aucune série</td></tr>`;
                } else {
                    for (const set of sorted) {
                        const ex = (set.exercises?.name || '—').replace(/</g, '&lt;');
                        rows += `<tr><td>${d}</td><td>${s}</td><td>${ex}</td><td style="text-align:center">${set.set_number}</td><td style="text-align:center">${set.weight_kg ?? '—'} kg</td><td style="text-align:center">${set.reps ?? '—'}${set.is_amrap ? ' 🔥' : ''}</td></tr>`;
                    }
                }
            }
        }
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;padding:24px;color:#1a1a2e}h1{color:#2D3182;font-size:26px;letter-spacing:3px;margin-bottom:4px}.sub{color:#888;font-size:12px;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#2D3182;color:#fff;padding:9px 8px;text-align:left;font-size:11px}td{padding:7px 8px;border-bottom:1px solid #e8eaf0}tr:nth-child(even) td{background:#f7f8fc}</style></head><body><h1>⚡ FORCE</h1><p class="sub">Rapport de progression · Du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')} · Généré le ${new Date().toLocaleDateString('fr-FR')}</p><table><thead><tr><th>Date</th><th>Séance</th><th>Exercice</th><th>Série</th><th>Poids</th><th>Reps</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    };

    const handleExport = async () => {
        if (!user || exporting) return;
        setExporting(true);
        try {
            const { start, end } = getExportDateRange();
            const logs = await fetchExportData(start, end);
            if (!logs.length) {
                Alert.alert('Aucune donnée', 'Aucune séance enregistrée pour cette période.');
                return;
            }
            if (exportFormat === 'csv') {
                const csv = generateCSV(logs);
                const uri = FileSystem.documentDirectory + `force_${formatDate(new Date())}.csv`;
                await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
                await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Exporter FORCE' });
            } else {
                const html = generateHTML(logs, start, end);
                const { uri } = await Print.printToFileAsync({ html });
                await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Exporter FORCE' });
            }
            setExportModalVisible(false);
        } catch (err: any) {
            Alert.alert('Erreur export', err.message);
        } finally {
            setExporting(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadAll();
        setRefreshing(false);
    };

    const calendarData = useMemo(() => {
        const data = [];
        for (let w = 1; w <= 52; w++) data.push({ week: w, year: 2026 });
        for (let w = 1; w <= 35; w++) data.push({ week: w, year: 2027 });
        return data;
    }, []);

    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight]} style={styles.container}>
            <View style={styles.topNav}>
                <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Text style={styles.weekLabel}>Semaine {currentWeek}</Text>
                    <Text style={styles.weekDates} numberOfLines={1}>{datesToDisplay[0].getDate()} {datesToDisplay[0].toLocaleString('default', { month: 'short' })} — {datesToDisplay[13].getDate()} {datesToDisplay[13].toLocaleString('default', { month: 'short' })} {currentYear}</Text>
                </View>
                <View style={styles.topNavRight}>
                    <TouchableOpacity style={styles.calendarBtn} onPress={() => setExportModalVisible(true)}>
                        <Text style={styles.calendarIcon}>📤</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.calendarBtn} onPress={() => setCalendarVisible(true)}>
                        <Text style={styles.calendarIcon}>📅</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.dateStrip}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
                    {datesToDisplay.map((date, i) => {
                        const active = formatDate(date) === formatDate(selectedDate);
                        const hasTraining = programDays.some(pd => pd.day_number === (date.getDay() || 7));
                        return (
                            <TouchableOpacity key={i} style={[styles.dateChip, active && styles.dateChipActive]} onPress={() => handleDateSelect(date)}>
                                <Text style={[styles.dateDay, active && styles.dateDayActive]}>{isToday(date) ? "Auj." : ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][date.getDay()]}</Text>
                                <Text style={[styles.dateNum, active && styles.dateNumActive]}>{date.getDate()}</Text>
                                {hasTraining && <View style={[styles.trainingIndicator, active && styles.trainingIndicatorActive]} />}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <View style={styles.sessionOverview}>
                {activeProgramDay ? (
                    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.sessionBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Text style={styles.sessionBadgeText}>
                            {['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'][(selectedDate.getDay() || 7) - 1]}
                            {activeProgramDay.day_label ? ` - ${activeProgramDay.day_label}` : ''}
                        </Text>
                    </LinearGradient>
                ) : (
                    <View style={styles.restBadge}><Text style={styles.restBadgeText}> JOUR DE REPOS 😴</Text></View>
                )}
                {savedRecently && <Text style={styles.savedIndicator}>✓ Enregistré automatiquement</Text>}
            </View>

            {loading ? (
                <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : !activeProgramDay ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyEmoji}>🌊</Text>
                    <Text style={styles.emptyTitle}>Repos</Text>
                    <Text style={styles.emptyText}>Aucune séance prévue au programme pour ce jour.</Text>
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <View style={styles.skipCard}>
                        <View style={styles.skipInfo}>
                            <Text style={styles.skipLabel}>Pas de séance aujourd'hui ?</Text>
                            <Text style={styles.skipSubtitle}>Annule la surcharge du jour</Text>
                        </View>
                        <Switch
                            value={isSkipped}
                            onValueChange={(value) => {
                                setIsSkipped(value);
                                handleSave(value);
                            }}
                            trackColor={{ false: colors.border, true: colors.error + '40' }}
                            thumbColor={isSkipped ? colors.error : '#f4f3f4'}
                        />
                    </View>

                    {isSkipped ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>😴</Text>
                            <Text style={styles.emptyTitle}>Séance sautée</Text>
                            <Text style={styles.emptyText}>Tu as indiqué ne pas avoir fait cette séance. La progression est mise en pause.</Text>
                        </View>
                    ) : (
                        <ScrollView style={styles.exerciseList} contentContainerStyle={styles.exerciseListContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
                            {activeProgramDay.exercises.map((exercise) => {
                                const exSets = sets.get(exercise.id) || [];
                                return (
                                    <View key={exercise.id} style={styles.exerciseBlock}>
                                        <View style={styles.exerciseHeader}>
                                            <Text style={styles.exerciseName}>{exercise.name}</Text>
                                            <View style={styles.targetBadge}>
                                                <Text style={styles.targetText}>{exercise.target_sets}×{exercise.target_reps} @ {exercise.current_weight_kg}kg</Text>
                                            </View>
                                        </View>
                                        <View style={styles.setHeaderRow}>
                                            <Text style={styles.setHeaderNum}>Série</Text>
                                            <Text style={styles.setHeaderVal}>Poids (kg)</Text>
                                            <Text style={styles.setHeaderVal}>Reps</Text>
                                        </View>
                                        {exSets.map((set, si) => (
                                            <View key={si} style={styles.setRow}>
                                                <TouchableOpacity style={[styles.setNumCircle, set.isAmrap && styles.setNumCircleAmrap]} onPress={() => toggleAmrap(exercise.id, si)}>
                                                    <Text style={[styles.setNum, set.isAmrap && styles.setNumAmrap]}>{set.isAmrap ? '🔥' : si + 1}</Text>
                                                </TouchableOpacity>
                                                <View style={styles.inputWrapper}>
                                                    <TextInput
                                                        style={[styles.setInput, set.isAmrap && styles.setInputAmrap]}
                                                        value={set.weight}
                                                        onChangeText={(v) => updateSet(exercise.id, si, 'weight', v)}
                                                        onFocus={() => { if (set.weight === '0') updateSet(exercise.id, si, 'weight', ''); }}
                                                        onBlur={triggerAutoSave}
                                                        selectTextOnFocus
                                                        keyboardType="numeric"
                                                        placeholderTextColor={colors.textMuted}
                                                    />
                                                    {si > 0 && <TouchableOpacity style={styles.pasteIcon} onPress={() => handlePaste(exercise.id, si)}><Text style={styles.pasteIconText}>📋</Text></TouchableOpacity>}
                                                </View>
                                                <View style={styles.inputWrapper}>
                                                    <TextInput
                                                        style={[styles.setInput, set.isAmrap && styles.setInputAmrap]}
                                                        value={set.reps}
                                                        onChangeText={(v) => updateSet(exercise.id, si, 'reps', v)}
                                                        onFocus={() => { if (set.reps === '0' || set.reps === '00') updateSet(exercise.id, si, 'reps', ''); }}
                                                        onBlur={triggerAutoSave}
                                                        selectTextOnFocus
                                                        keyboardType="numeric"
                                                        placeholder={exercise.target_reps.toString()}
                                                        placeholderTextColor={colors.textMuted}
                                                    />
                                                    {set.isAmrap && (
                                                        <View style={styles.amrapLabel}>
                                                            <Text style={styles.amrapLabelText}>À L'ÉCHEC</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            )}

            {/* ── Export Modal ───────────────────────────────────── */}
            <Modal visible={exportModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>📤 Exporter les données</Text>
                            <TouchableOpacity onPress={() => setExportModalVisible(false)}>
                                <Text style={styles.closeModal}>Fermer</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.exportSectionLabel}>PÉRIODE</Text>
                        <View style={styles.exportTypeTabs}>
                            <TouchableOpacity
                                style={[styles.exportTypeTab, exportPeriodType === 'weeks' && styles.exportTypeTabActive]}
                                onPress={() => { setExportPeriodType('weeks'); setExportAmount(4); }}
                            >
                                <Text style={[styles.exportTypeTabText, exportPeriodType === 'weeks' && styles.exportTypeTabTextActive]}>Semaines</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.exportTypeTab, exportPeriodType === 'months' && styles.exportTypeTabActive]}
                                onPress={() => { setExportPeriodType('months'); setExportAmount(1); }}
                            >
                                <Text style={[styles.exportTypeTabText, exportPeriodType === 'months' && styles.exportTypeTabTextActive]}>Mois</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.exportAmountRow}>
                            {(exportPeriodType === 'weeks'
                                ? [1, 2, 3, 4, 6, 8, 12, 16, 20]
                                : [1, 2, 3, 4, 5]
                            ).map(n => (
                                <TouchableOpacity
                                    key={n}
                                    style={[styles.exportAmountChip, exportAmount === n && styles.exportAmountChipActive]}
                                    onPress={() => setExportAmount(n)}
                                >
                                    <Text style={[styles.exportAmountText, exportAmount === n && styles.exportAmountTextActive]}>
                                        {n}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.exportPeriodHint}>
                            {exportPeriodType === 'weeks'
                                ? `${exportAmount} dernière${exportAmount > 1 ? 's' : ''} semaine${exportAmount > 1 ? 's' : ''}`
                                : `${exportAmount} dernier${exportAmount > 1 ? 's' : ''} mois`}
                        </Text>

                        <Text style={styles.exportSectionLabel}>FORMAT</Text>
                        <View style={styles.exportFormatRow}>
                            <TouchableOpacity
                                style={[styles.exportFormatBtn, exportFormat === 'csv' && styles.exportFormatBtnActive]}
                                onPress={() => setExportFormat('csv')}
                            >
                                <Text style={styles.exportFormatIcon}>📊</Text>
                                <Text style={[styles.exportFormatText, exportFormat === 'csv' && styles.exportFormatTextActive]}>CSV</Text>
                                <Text style={styles.exportFormatSub}>Excel / Google Sheets</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.exportFormatBtn, exportFormat === 'pdf' && styles.exportFormatBtnActive]}
                                onPress={() => setExportFormat('pdf')}
                            >
                                <Text style={styles.exportFormatIcon}>📄</Text>
                                <Text style={[styles.exportFormatText, exportFormat === 'pdf' && styles.exportFormatTextActive]}>PDF</Text>
                                <Text style={styles.exportFormatSub}>Impression / Partage</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.exportBtn} onPress={handleExport} disabled={exporting}>
                            <LinearGradient colors={['#2D3182', '#1a1f6b']} style={styles.exportBtnGradient}>
                                {exporting
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={styles.exportBtnText}>Exporter</Text>}
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={calendarVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Choisir une semaine</Text>
                            <TouchableOpacity onPress={() => setCalendarVisible(false)}><Text style={styles.closeModal}>Réduire</Text></TouchableOpacity>
                        </View>
                        <FlatList
                            data={calendarData}
                            keyExtractor={(item) => `${item.year}-${item.week}`}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={[styles.weekRow, item.week === currentWeek && item.year === currentYear && styles.weekRowActive]} onPress={() => handleWeekSelect(item.week, item.year)}>
                                    <Text style={[styles.weekRowYear, item.week === currentWeek && item.year === currentYear && styles.weekRowYearActive]}>{item.year}</Text>
                                    <Text style={[styles.weekRowLabel, item.week === currentWeek && item.year === currentYear && styles.weekRowLabelActive]}>Semaine {item.week}</Text>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1, paddingTop: 60 },
    topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
    topNavRight: { flexDirection: 'row', gap: 8 },

    exportSectionLabel: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 1, marginTop: 20, marginBottom: 10 },
    exportTypeTabs: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    exportTypeTab: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
    exportTypeTabActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
    exportTypeTabText: { fontWeight: '700', color: colors.textSecondary, fontSize: 14 },
    exportTypeTabTextActive: { color: colors.primary },
    exportAmountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    exportAmountChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.card },
    exportAmountChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
    exportAmountText: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
    exportAmountTextActive: { color: '#fff' },
    exportPeriodHint: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
    exportFormatRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
    exportFormatBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.card },
    exportFormatBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '12' },
    exportFormatIcon: { fontSize: 28, marginBottom: 4 },
    exportFormatText: { fontSize: 16, fontWeight: '800', color: colors.textSecondary },
    exportFormatTextActive: { color: colors.primary },
    exportFormatSub: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
    exportBtn: { borderRadius: 14, overflow: 'hidden' },
    exportBtnGradient: { paddingVertical: 16, alignItems: 'center' },
    exportBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
    weekLabel: { fontSize: 22, fontWeight: '900', color: colors.text },
    weekDates: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    calendarBtn: { backgroundColor: colors.card, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    calendarIcon: { fontSize: 20 },

    dateStrip: { paddingBottom: SPACING.md },
    dateScroll: { paddingHorizontal: SPACING.md, gap: 10 },
    dateChip: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colors.card, minWidth: 60, borderWidth: 1, borderColor: colors.border },
    dateChipActive: { backgroundColor: colors.primary, borderColor: colors.primary, elevation: 4 },
    dateDay: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    dateDayActive: { color: colors.text },
    dateNum: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
    dateNumActive: { color: colors.text },
    trainingIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 4 },
    trainingIndicatorActive: { backgroundColor: colors.text },

    sessionOverview: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
    savedIndicator: { textAlign: 'center', color: '#2DD46B', fontSize: 12, fontWeight: '700', marginTop: 6 },
    sessionBadge: { borderRadius: BORDER_RADIUS.sm, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
    sessionBadgeText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
    restBadge: { backgroundColor: colors.card, borderRadius: BORDER_RADIUS.sm, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    restBadgeText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },

    exerciseList: { flex: 1 },
    exerciseListContent: { padding: SPACING.md, paddingBottom: 120 },
    exerciseBlock: { backgroundColor: colors.card, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border },
    exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
    exerciseName: { color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 },
    targetBadge: { backgroundColor: colors.backgroundLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    targetText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },

    setHeaderRow: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 4 },
    setHeaderNum: { color: colors.textMuted, fontSize: 10, width: 40, fontWeight: '700' },
    setHeaderVal: { color: colors.textMuted, fontSize: 10, flex: 1, textAlign: 'center', fontWeight: '700' },

    setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    setNumCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundLight, justifyContent: 'center', alignItems: 'center' },
    setNum: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
    inputWrapper: { flex: 1, position: 'relative' },
    setInput: { width: '100%', backgroundColor: colors.backgroundLight, borderRadius: 8, padding: 10, color: colors.text, fontSize: 16, textAlign: 'center', fontWeight: '700', borderWidth: 1, borderColor: colors.border },
    pasteIcon: { position: 'absolute', right: 5, top: '50%', marginTop: -12, backgroundColor: colors.card, padding: 2, borderRadius: 4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2 },
    pasteIconText: { fontSize: 12 },



    skipCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, marginHorizontal: SPACING.md, marginBottom: SPACING.md, padding: 16, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: colors.border },
    skipInfo: { flex: 1 },
    skipLabel: { color: colors.text, fontSize: 15, fontWeight: '800' },
    skipSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, marginTop: 40 },
    emptyEmoji: { fontSize: 64, marginBottom: 20 },
    emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 10 },
    emptyText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: SPACING.xl, height: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
    closeModal: { color: colors.primary, fontWeight: '700' },
    weekRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border + '30', gap: 15 },
    weekRowActive: { backgroundColor: colors.primary + '10', borderRadius: 12, paddingHorizontal: 12 },
    weekRowYear: { fontSize: 12, fontWeight: '800', color: colors.textMuted, width: 40 },
    weekRowYearActive: { color: colors.primary },
    weekRowLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
    weekRowLabelActive: { color: colors.primary },

    setNumCircleAmrap: { backgroundColor: colors.accent + '20', borderColor: colors.accent, borderWidth: 1 },
    setNumAmrap: { color: colors.accent },
    setInputAmrap: { borderColor: colors.accent, backgroundColor: colors.accent + '05' },
    amrapLabel: { position: 'absolute', top: -14, right: 0, backgroundColor: colors.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    amrapLabelText: { color: '#FFF', fontSize: 8, fontWeight: '900' },
});
