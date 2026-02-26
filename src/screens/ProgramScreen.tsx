import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
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
                <TouchableOpacity style={styles.editBtn} onPress={() => setCreating(true)}>
                    <Text style={styles.editBtnText}>Modifier</Text>
                </TouchableOpacity>
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
