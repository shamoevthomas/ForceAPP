import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { SPACING, BORDER_RADIUS } from '../constants/theme';
import { ProgramWithDays, Exercise } from '../types';
import ProgramCreationScreen from './ProgramCreationScreen';

const WEEKDAYS = [
    { id: 1, label: 'Lun', full: 'Lundi' },
    { id: 2, label: 'Mar', full: 'Mardi' },
    { id: 3, label: 'Mer', full: 'Mercredi' },
    { id: 4, label: 'Jeu', full: 'Jeudi' },
    { id: 5, label: 'Ven', full: 'Vendredi' },
    { id: 6, label: 'Sam', full: 'Samedi' },
    { id: 7, label: 'Dim', full: 'Dimanche' },
];

export default function ProgramScreen() {
    const { user } = useAuth();
    const { colors, isDark } = useTheme();
    const styles = createStyles(colors);
    const [program, setProgram] = useState<ProgramWithDays | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    // Get today's weekday (1=Mon, 7=Sun)
    const today = (new Date().getDay() + 6) % 7 + 1;
    const [selectedDayId, setSelectedDayId] = useState(today);

    // Removed local restDays state as we now use is_rest_day from DB
    // const [restDays, setRestDays] = useState<Record<number, boolean>>({});

    const fetchProgram = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data } = await supabase
            .from('programs')
            .select(`
                *,
                program_days (
                  *,
                  exercises (*)
                )
            `)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();

        if (data) {
            const p = data as ProgramWithDays;
            p.program_days = p.program_days
                .sort((a, b) => a.day_number - b.day_number)
                .map(d => ({
                    ...d,
                    exercises: d.exercises.sort((a, b) => a.sort_order - b.sort_order),
                }));
            setProgram(p);
        } else {
            setProgram(null);
        }
        setLoading(false);
    }, [user]);

    useFocusEffect(
        useCallback(() => {
            fetchProgram();
        }, [fetchProgram])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchProgram();
        setRefreshing(false);
    };

    const currentDayData = useMemo(() => {
        if (!program) return null;
        return program.program_days.find(d => d.day_number === selectedDayId);
    }, [program, selectedDayId]);

    const isRestDay = !!currentDayData?.is_rest_day;


    const handleReset = () => {
        Alert.alert(
            '⚠️ Réinitialiser ?',
            'Ton programme actuel sera supprimé.',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Réinitialiser', style: 'destructive',
                    onPress: async () => {
                        if (program) {
                            await supabase.from('programs').delete().eq('id', program.id);
                            setProgram(null);
                            setCreating(true);
                        }
                    },
                },
            ],
        );
    };

    const handleExportPDF = async () => {
        if (!program || exportingPdf) return;
        setExportingPdf(true);
        try {
            const activeDays = WEEKDAYS.filter(day => {
                const d = program.program_days.find(pd => pd.day_number === day.id);
                return d && !d.is_rest_day;
            });
            const restDays = WEEKDAYS.filter(day => {
                const d = program.program_days.find(pd => pd.day_number === day.id);
                return !d || d.is_rest_day;
            });

            const dayBlocks = WEEKDAYS.map(day => {
                const dayData = program.program_days.find(d => d.day_number === day.id);
                if (!dayData || dayData.is_rest_day) {
                    return `<div class="day-block rest"><div class="day-header"><span class="day-name">${day.full}</span><span class="day-rest-tag">Repos</span></div></div>`;
                }
                const exRows = dayData.exercises.map((ex: Exercise, i: number) => `
                <tr class="${i % 2 === 1 ? 'alt' : ''}">
                  <td class="td-num">${i + 1}</td>
                  <td class="td-name">${ex.name.replace(/</g, '&lt;')}</td>
                  <td class="td-center">${ex.target_sets}</td>
                  <td class="td-center">${ex.target_reps}</td>
                  <td class="td-center">${ex.current_weight_kg} kg</td>
                  <td class="td-inc">+${ex.weight_increment} kg</td>
                </tr>`).join('');
                return `
                <div class="day-block">
                  <div class="day-header">
                    <span class="day-name">${day.full}</span>
                    ${dayData.day_label ? `<span class="day-label-tag">${dayData.day_label.replace(/</g, '&lt;')}</span>` : ''}
                    <span class="day-count">${dayData.exercises.length} exercice${dayData.exercises.length > 1 ? 's' : ''}</span>
                  </div>
                  <table>
                    <thead><tr><th class="th-num">#</th><th>Exercice</th><th class="th-center">Séries</th><th class="th-center">Reps</th><th class="th-center">Poids actuel</th><th class="th-center">Surcharge</th></tr></thead>
                    <tbody>${exRows}</tbody>
                  </table>
                </div>`;
            }).join('');

            const totalExercises = activeDays.reduce((acc, day) => {
                const d = program.program_days.find(pd => pd.day_number === day.id);
                return acc + (d?.exercises.length || 0);
            }, 0);

            const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
@page { size: A4; margin: 15mm 18mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; color: #1a1a2e; font-size: 10pt; background: #fff; }

.header { display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 14px; border-bottom: 3px solid #2D3182; margin-bottom: 18px; }
.brand-wrap { display: flex; align-items: center; gap: 10px; }
.logo { font-size: 26pt; }
.brand { font-size: 26pt; font-weight: 900; color: #2D3182; letter-spacing: 5px; }
.header-right { text-align: right; }
.prog-name { font-size: 13pt; font-weight: 800; color: #1a1a2e; }
.prog-date { font-size: 8pt; color: #888; margin-top: 3px; }

.stats-row { display: flex; gap: 12px; margin-bottom: 18px; }
.stat-box { flex: 1; background: #f0f2fa; border-radius: 8px; padding: 10px 12px; text-align: center; }
.stat-val { font-size: 16pt; font-weight: 900; color: #2D3182; }
.stat-lbl { font-size: 7pt; color: #888; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }

.day-block { margin-bottom: 14px; border-radius: 8px; overflow: hidden; border: 1.5px solid #e0e4f0; page-break-inside: avoid; }
.day-block.rest { border-color: #e5e7eb; }
.day-header { display: flex; align-items: center; gap: 10px; padding: 9px 13px; background: #2D3182; }
.day-block.rest .day-header { background: #9ca3af; }
.day-name { font-size: 10pt; font-weight: 800; color: #fff; letter-spacing: .5px; }
.day-label-tag { font-size: 9pt; font-weight: 600; color: rgba(255,255,255,0.8); flex: 1; }
.day-rest-tag { font-size: 8pt; color: rgba(255,255,255,0.7); font-style: italic; flex: 1; }
.day-count { font-size: 8pt; color: rgba(255,255,255,0.6); font-weight: 600; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th { background: #f5f6fb; padding: 6px 8px; text-align: left; font-size: 7.5pt; font-weight: 800; color: #5060a0; text-transform: uppercase; letter-spacing: .4px; }
td { padding: 7px 8px; border-bottom: 1px solid #f0f2f8; }
tr.alt td { background: #fafbff; }
tr:last-child td { border-bottom: none; }
.td-num { width: 22px; color: #bbb; font-weight: 700; font-size: 8pt; }
.td-name { font-weight: 700; color: #1a1a2e; }
.td-center { text-align: center; font-weight: 700; color: #2D3182; }
.td-inc { text-align: center; font-weight: 700; color: #d97706; font-size: 8pt; }
.th-num { width: 22px; }
.th-center { text-align: center; }

.footer { margin-top: 18px; padding-top: 10px; border-top: 1px solid #eef0f8; display: flex; justify-content: space-between; font-size: 8pt; color: #aaa; }
</style>
</head>
<body>

<div class="header">
  <div class="brand-wrap"><span class="logo">⚡</span><span class="brand">FORCE</span></div>
  <div class="header-right">
    <div class="prog-name">${(program.name || 'Mon programme').replace(/</g, '&lt;')}</div>
    <div class="prog-date">Exporté le ${new Date().toLocaleDateString('fr-FR')}</div>
  </div>
</div>

<div class="stats-row">
  <div class="stat-box"><div class="stat-val">${activeDays.length}</div><div class="stat-lbl">Jours d'entraînement</div></div>
  <div class="stat-box"><div class="stat-val">${restDays.length}</div><div class="stat-lbl">Jours de repos</div></div>
  <div class="stat-box"><div class="stat-val">${totalExercises}</div><div class="stat-lbl">Exercices au total</div></div>
</div>

${dayBlocks}

<div class="footer">
  <span>⚡ FORCE — Programme d'entraînement</span>
  <span>${new Date().toLocaleDateString('fr-FR')}</span>
</div>

</body>
</html>`;

            const { uri } = await Print.printToFileAsync({ html, base64: false });
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                UTI: 'com.adobe.pdf',
                dialogTitle: 'Exporter le programme FORCE',
            });
        } catch (err: any) {
            Alert.alert('Erreur export', err.message);
        } finally {
            setExportingPdf(false);
        }
    };

    if (creating) {
        return (
            <ProgramCreationScreen
                initialData={program || undefined}
                onBack={() => setCreating(false)}
                onComplete={() => {
                    setCreating(false);
                    fetchProgram();
                }}
            />
        );
    }

    if (loading) {
        return (
            <LinearGradient colors={[colors.background, isDark ? '#0A0A1A' : colors.cardLight]} style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </LinearGradient>
        );
    }

    if (!program) {
        return <ProgramCreationScreen onComplete={() => fetchProgram()} />;
    }


    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight]} style={styles.container}>
            {/* Header with Program Name */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Programme</Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.exportBtn} onPress={handleExportPDF} disabled={exportingPdf}>
                        {exportingPdf
                            ? <ActivityIndicator size="small" color={colors.primary} />
                            : <Text style={styles.exportBtnText}>📤 PDF</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.editBtn} onPress={() => setCreating(true)}>
                        <Text style={styles.editBtnText}>Modifier</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Weekday Selector */}
            <View style={styles.weekdaySelector}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekdayScroll}>
                    {WEEKDAYS.map((day) => (
                        <TouchableOpacity
                            key={day.id}
                            style={[
                                styles.dayTab,
                                selectedDayId === day.id && styles.dayTabActive,
                                day.id === today && styles.dayTabToday
                            ]}
                            onPress={() => setSelectedDayId(day.id)}
                        >
                            <Text style={[
                                styles.dayTabText,
                                selectedDayId === day.id && styles.dayTabTextActive
                            ]}>
                                {day.label}
                            </Text>
                            {day.id === today && <View style={styles.todayDot} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >

                {/* Exercises or Rest Message */}
                {isRestDay ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyEmoji}>🌊</Text>
                        <Text style={styles.emptyTitle}>Récupération active</Text>
                        <Text style={styles.emptyText}>
                            Le repos est crucial pour la croissance. Profite de cette journée pour recharger tes batteries.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.exerciseList}>
                        <Text style={styles.sessionTitle}>
                            {currentDayData?.day_label || 'Séance prévue'}
                        </Text>
                        {currentDayData?.exercises.map((ex: Exercise, index: number) => (
                            <View key={ex.id} style={styles.exerciseCard}>
                                <View style={styles.exerciseHeader}>
                                    <View style={styles.exerciseNumber}>
                                        <Text style={styles.exerciseNumberText}>{index + 1}</Text>
                                    </View>
                                    <Text style={styles.exerciseName}>{ex.name}</Text>
                                </View>
                                <View style={styles.exerciseStats}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>SÉRIES</Text>
                                        <Text style={styles.statValue}>{ex.target_sets}</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>REPS</Text>
                                        <Text style={styles.statValue}>{ex.target_reps}</Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>DERNIÈRE PERF</Text>
                                        <Text style={styles.statValue}>{ex.current_weight_kg}<Text style={styles.unitText}>kg</Text></Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                    <Text style={styles.resetText}>🗑 Réinitialiser le programme</Text>
                </TouchableOpacity>
            </ScrollView>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        paddingTop: 60,
        paddingHorizontal: SPACING.lg,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md,
    },
    title: { fontSize: 24, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    exportBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        minWidth: 72,
        alignItems: 'center',
    },
    exportBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
    editBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: colors.primary + '20',
        borderRadius: 20,
    },
    editBtnText: { color: colors.primary, fontSize: 12, fontWeight: '700' },

    weekdaySelector: {
        marginBottom: SPACING.md,
    },
    weekdayScroll: {
        paddingHorizontal: SPACING.lg,
        gap: 10,
    },
    dayTab: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    dayTabActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    dayTabToday: {
        borderColor: colors.primary,
    },
    dayTabText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textSecondary,
    },
    dayTabTextActive: {
        color: '#FFFFFF',
    },
    todayDot: {
        position: 'absolute',
        bottom: 4,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.primary,
    },

    scroll: { padding: SPACING.lg, paddingBottom: 120 },


    sessionTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.text,
        marginBottom: SPACING.md,
        paddingLeft: 4,
    },
    exerciseList: { gap: SPACING.md },
    exerciseCard: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    exerciseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        marginBottom: SPACING.md,
    },
    exerciseNumber: {
        width: 24,
        height: 24,
        borderRadius: 6,
        backgroundColor: colors.primary + '20',
        justifyContent: 'center',
        alignItems: 'center',
    },
    exerciseNumberText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    exerciseName: { fontSize: 16, fontWeight: '700', color: colors.text },

    exerciseStats: {
        flexDirection: 'row',
        backgroundColor: colors.backgroundLight,
        borderRadius: BORDER_RADIUS.sm,
        padding: SPACING.sm,
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    statItem: { alignItems: 'center', flex: 1 },
    statLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, marginBottom: 2 },
    statValue: { fontSize: 16, fontWeight: '800', color: colors.text },
    unitText: { fontSize: 10, color: colors.textSecondary, fontWeight: '400' },
    statDivider: { width: 1, height: '60%', backgroundColor: colors.border + '40' },

    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
        backgroundColor: colors.card + '40',
        borderRadius: BORDER_RADIUS.lg,
        borderWidth: 1,
        borderColor: colors.border,
        borderStyle: 'dashed',
    },
    emptyEmoji: { fontSize: 50, marginBottom: SPACING.md },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: SPACING.sm },
    emptyText: {
        fontSize: 14,
        color: colors.textSecondary,
        textAlign: 'center',
        paddingHorizontal: SPACING.xl,
        lineHeight: 20,
    },

    resetButton: {
        marginTop: SPACING.xxl,
        padding: SPACING.md,
        alignItems: 'center',
    },
    resetText: { color: colors.error, fontSize: 13, fontWeight: '600' },
});
