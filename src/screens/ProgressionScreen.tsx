import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, FlatList, Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
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
    return date.toISOString().split('T')[0];
}

function isToday(date: Date): boolean {
    const today = new Date();
    return formatDate(date) === formatDate(today);
}

// ─── Progressive Overload Logic ──────────────────────────────────
function calculateNextWeight(exercise: Exercise, completedSets: WorkoutSet[]): number {
    const allSetsCompleted = completedSets.length >= exercise.target_sets;
    const allRepsHit = completedSets.every(s => (s.reps || 0) >= exercise.target_reps);
    if (allSetsCompleted && allRepsHit) {
        return exercise.current_weight_kg + parseFloat(exercise.weight_increment);
    }
    return exercise.current_weight_kg;
}

export default function ProgressionScreen() {
    const { user } = useAuth();
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
                    setsMap.set(ex.id, generateDefaultSets(ex));
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
                        const nextWeight = calculateNextWeight(ex, lastSets as WorkoutSet[]);
                        setsMap.set(ex.id, Array.from({ length: ex.target_sets }, () => ({
                            weight: nextWeight.toString(),
                            reps: '',
                            isAmrap: false,
                        })));
                    } else {
                        setsMap.set(ex.id, generateDefaultSets(ex));
                    }
                } else {
                    setsMap.set(ex.id, generateDefaultSets(ex));
                }
            }
        }
        setSets(setsMap);
        setLoading(false);
    }, [user]);

    const generateDefaultSets = (ex: Exercise) => {
        return Array.from({ length: ex.target_sets }, () => ({
            weight: ex.current_weight_kg.toString(),
            reps: '',
            isAmrap: false,
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
        }, [loadAll])
    );

    const handleDateSelect = (date: Date) => {
        setSelectedDate(date);
        fetchWorkout(date, programDays);
    };

    const handleWeekSelect = (week: number, year: number) => {
        setCurrentWeek(week);
        setCurrentYear(year);
        const start = getStartOfWeek(week, year);
        setSelectedDate(start);
        fetchWorkout(start, programDays);
        setCalendarVisible(false);
    };

    const handlePaste = (exerciseId: string, setIndex: number) => {
        if (setIndex === 0) return;
        const newSets = new Map(sets);
        const exSets = [...(newSets.get(exerciseId) || [])];
        const prevSet = exSets[setIndex - 1];
        if (prevSet) {
            exSets[setIndex] = { ...exSets[setIndex], weight: prevSet.weight, reps: prevSet.reps };
            newSets.set(exerciseId, exSets);
            setSets(newSets);
        }
    };

    const updateSet = (exerciseId: string, setIndex: number, field: string, value: string) => {
        const newSets = new Map(sets);
        const exSets = [...(newSets.get(exerciseId) || [])];
        exSets[setIndex] = { ...exSets[setIndex], [field]: value };
        newSets.set(exerciseId, exSets);
        setSets(newSets);
    };

    const handleSave = async () => {
        if (!user || !activeProgramDay) return;
        setSaving(true);
        try {
            const dateStr = formatDate(selectedDate);
            let logId;
            if (workoutLog) {
                const { data, error } = await supabase
                    .from('workout_logs')
                    .update({ completed: !isSkipped, is_skipped: isSkipped })
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
                        completed: !isSkipped,
                        is_skipped: isSkipped,
                    })
                    .select().single();
                if (error) throw error;
                logId = data.id;
            }

            if (!isSkipped) {
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

            const weightUpdates: Promise<any>[] = [];
            if (!isSkipped) {
                sets.forEach((exSets, exerciseId) => {
                    for (let i = exSets.length - 1; i >= 0; i--) {
                        const s = exSets[i];
                        const repsAchieved = parseInt(s.reps) || 0;
                        const weightUsed = parseFloat(s.weight) || 0;
                        const targetReps = activeProgramDay.exercises.find(e => e.id === exerciseId)?.target_reps || 12;

                        if (weightUsed > 0 && repsAchieved >= (targetReps - 1)) {
                            // Wrap in Promise.resolve to satisfy the type system if needed
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

            Alert.alert(isSkipped ? '😴 Séance enregistrée comme sautée' : '✅ Séance sauvegardée !');
            fetchWorkout(selectedDate, programDays);
        } catch (err: any) {
            Alert.alert('Erreur', err.message);
        } finally {
            setSaving(false);
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
                <View>
                    <Text style={styles.weekLabel}>Semaine {currentWeek}</Text>
                    <Text style={styles.weekDates}>{datesToDisplay[0].getDate()} {datesToDisplay[0].toLocaleString('default', { month: 'short' })} — {datesToDisplay[13].getDate()} {datesToDisplay[13].toLocaleString('default', { month: 'short' })} {currentYear}</Text>
                </View>
                <TouchableOpacity style={styles.calendarBtn} onPress={() => setCalendarVisible(true)}>
                    <Text style={styles.calendarIcon}>📅</Text>
                </TouchableOpacity>
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
                            onValueChange={setIsSkipped}
                            trackColor={{ false: colors.border, true: colors.error + '40' }}
                            thumbColor={isSkipped ? colors.error : '#f4f3f4'}
                        />
                    </View>

                    {isSkipped ? (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>😴</Text>
                            <Text style={styles.emptyTitle}>Séance sautée</Text>
                            <Text style={styles.emptyText}>Tu as indiqué ne pas avoir fait cette séance. La progression est mise en pause.</Text>
                            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                                <LinearGradient colors={[colors.error, '#FF3B30']} style={styles.saveGradient}>
                                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveText}>💾 Valider l'absence</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
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
                                                <View style={styles.setNumCircle}><Text style={styles.setNum}>{si + 1}</Text></View>
                                                <View style={styles.inputWrapper}>
                                                    <TextInput style={styles.setInput} value={set.weight} onChangeText={(v) => updateSet(exercise.id, si, 'weight', v)} keyboardType="numeric" placeholderTextColor={colors.textMuted} />
                                                    {si > 0 && <TouchableOpacity style={styles.pasteIcon} onPress={() => handlePaste(exercise.id, si)}><Text style={styles.pasteIconText}>📋</Text></TouchableOpacity>}
                                                </View>
                                                <View style={styles.inputWrapper}>
                                                    <TextInput style={styles.setInput} value={set.reps} onChangeText={(v) => updateSet(exercise.id, si, 'reps', v)} keyboardType="numeric" placeholder={exercise.target_reps.toString()} placeholderTextColor={colors.textMuted} />
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                );
                            })}
                            <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
                                <LinearGradient colors={['#2DD46B', '#1FB155']} style={styles.saveGradient}>
                                    {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>✅ Valider la séance</Text>}
                                </LinearGradient>
                            </TouchableOpacity>
                        </ScrollView>
                    )}
                </View>
            )}

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

    saveButton: { borderRadius: BORDER_RADIUS.sm, overflow: 'hidden', marginTop: SPACING.md, marginBottom: SPACING.xl },
    saveGradient: { paddingVertical: 16, alignItems: 'center' },
    saveText: { color: '#FFF', fontSize: 17, fontWeight: '800' },

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
});
