import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Dimensions, ActivityIndicator, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { SPACING, BORDER_RADIUS } from '../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FILTERS = [
    { label: '1M', months: 1 },
    { label: '3M', months: 3 },
    { label: '6M', months: 6 },
    { label: '1A', months: 12 },
    { label: 'Tout', months: 0 },
];

type ChartView = 'weight' | 'force' | 'exercise';

export default function ChartsScreen() {
    const { colors, isDark } = useTheme();
    const styles = createStyles(colors);
    const { user } = useAuth();
    const [view, setView] = useState<ChartView>('force');
    const [filter, setFilter] = useState(3); // months
    const [chartData, setChartData] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
    const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
    const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchExercises = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('exercises')
            .select('id, name, program_day:program_days!inner(program:programs!inner(user_id))')
            .eq('program_day.program.user_id', user.id);

        if (data) {
            const unique = data.reduce((acc: { id: string; name: string }[], ex: any) => {
                if (!acc.find(e => e.name === ex.name)) {
                    acc.push({ id: ex.id, name: ex.name });
                }
                return acc;
            }, []);
            setExercises(unique);
        }
    }, [user]);

    const fetchChartData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const startDate = filter > 0
            ? new Date(Date.now() - filter * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : '2000-01-01';

        if (view === 'weight') {
            // Body weight over time — from workout_logs dates + user weight
            // We'll approximate by using workout_logs as data points
            const { data } = await supabase
                .from('workout_logs')
                .select('workout_date')
                .eq('user_id', user.id)
                .eq('completed', true)
                .gte('workout_date', startDate)
                .order('workout_date', { ascending: true });

            if (data && data.length > 0) {
                // For body weight, we need a weight_logs table or use current weight
                // For now, show current weight as flat line with workout frequency
                const { data: profile } = await supabase
                    .from('users')
                    .select('current_weight_kg')
                    .eq('id', user.id)
                    .single();

                const weight = profile?.current_weight_kg || 0;
                const labels = data.slice(-10).map(d => {
                    const date = new Date(d.workout_date);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                });
                setChartData({
                    labels,
                    data: labels.map(() => weight), // flat until we add weight history
                });
            } else {
                setChartData({ labels: ['—'], data: [0] });
            }
        } else if (view === 'force') {
            // Total volume per workout over time
            const { data } = await supabase
                .from('workout_logs')
                .select('id, workout_date, workout_sets(weight_kg, reps)')
                .eq('user_id', user.id)
                .eq('completed', true)
                .gte('workout_date', startDate)
                .order('workout_date', { ascending: true });

            if (data && data.length > 0) {
                const points = data.map((log: any) => {
                    const volume = (log.workout_sets || []).reduce(
                        (sum: number, s: any) => sum + (s.weight_kg || 0) * (s.reps || 0), 0
                    );
                    return { date: log.workout_date, volume };
                });

                const last = points.slice(-10);
                setChartData({
                    labels: last.map(p => {
                        const d = new Date(p.date);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                    }),
                    data: last.map(p => p.volume),
                });
            } else {
                setChartData({ labels: ['—'], data: [0] });
            }
        } else if (view === 'exercise' && selectedExercise) {
            // Weight progression for specific exercise
            const selected = exercises.find(e => e.id === selectedExercise);
            if (!selected) { setLoading(false); return; }

            const { data } = await supabase
                .from('workout_sets')
                .select('weight_kg, reps, workout_log:workout_logs!inner(workout_date, user_id)')
                .eq('workout_log.user_id', user.id)
                .eq('exercise_id', selectedExercise)
                .gte('workout_log.workout_date', startDate)
                .order('workout_log(workout_date)', { ascending: true });

            if (data && data.length > 0) {
                // Group by date, take max weight
                const byDate = new Map<string, number>();
                data.forEach((s: any) => {
                    const date = (s.workout_log as any).workout_date;
                    const current = byDate.get(date) || 0;
                    byDate.set(date, Math.max(current, s.weight_kg || 0));
                });

                const entries = Array.from(byDate.entries()).slice(-10);
                setChartData({
                    labels: entries.map(([date]) => {
                        const d = new Date(date);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                    }),
                    data: entries.map(([_, w]) => w),
                });
            } else {
                setChartData({ labels: ['—'], data: [0] });
            }
        }

        setLoading(false);
    }, [user, view, filter, selectedExercise]);

    useEffect(() => { fetchExercises(); }, []);
    useEffect(() => { fetchChartData(); }, [view, filter, selectedExercise]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchChartData();
        setRefreshing(false);
    };

    const chartConfig = {
        backgroundGradientFrom: colors.card,
        backgroundGradientTo: colors.card,
        decimalPlaces: 0,
        color: (opacity = 1) => isDark ? `rgba(108, 99, 255, ${opacity})` : `rgba(74, 66, 212, ${opacity})`,
        labelColor: () => colors.textMuted,
        propsForDots: {
            r: '4',
            strokeWidth: '2',
            stroke: colors.primary,
        },
        propsForBackgroundLines: {
            strokeWidth: 0.5,
            stroke: colors.border,
        },
    };

    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight]} style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                <Text style={styles.title}>📈 Graphiques</Text>

                {/* View Tabs */}
                <View style={styles.viewTabs}>
                    {[
                        { key: 'force' as ChartView, label: '💪 Force', icon: '' },
                        { key: 'weight' as ChartView, label: '⚖️ Poids', icon: '' },
                        { key: 'exercise' as ChartView, label: '🎯 Exercice', icon: '' },
                    ].map(v => (
                        <TouchableOpacity
                            key={v.key}
                            style={[styles.viewTab, view === v.key && styles.viewTabActive]}
                            onPress={() => setView(v.key)}
                        >
                            <Text style={[styles.viewTabText, view === v.key && styles.viewTabTextActive]}>
                                {v.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Exercise Selector */}
                {view === 'exercise' && (
                    <ScrollView
                        horizontal showsHorizontalScrollIndicator={false}
                        style={styles.exerciseSelector}
                    >
                        {exercises.map(ex => (
                            <TouchableOpacity
                                key={ex.id}
                                style={[styles.exChip, selectedExercise === ex.id && styles.exChipActive]}
                                onPress={() => setSelectedExercise(ex.id)}
                            >
                                <Text style={[styles.exChipText, selectedExercise === ex.id && styles.exChipTextActive]}>
                                    {ex.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                {/* Time Filters */}
                <View style={styles.filterRow}>
                    {FILTERS.map(f => (
                        <TouchableOpacity
                            key={f.label}
                            style={[styles.filterChip, filter === f.months && styles.filterChipActive]}
                            onPress={() => setFilter(f.months)}
                        >
                            <Text style={[styles.filterText, filter === f.months && styles.filterTextActive]}>
                                {f.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Chart */}
                {loading ? (
                    <View style={styles.chartLoading}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : chartData.data.length > 0 && chartData.data.some(d => d > 0) ? (
                    <View style={styles.chartContainer}>
                        <LineChart
                            data={{
                                labels: chartData.labels,
                                datasets: [{ data: chartData.data }],
                            }}
                            width={SCREEN_WIDTH - SPACING.lg * 2}
                            height={260}
                            chartConfig={chartConfig}
                            bezier
                            style={styles.chart}
                            withInnerLines={true}
                            withOuterLines={false}
                            withVerticalLabels={true}
                            withHorizontalLabels={true}
                        />
                    </View>
                ) : (
                    <View style={styles.emptyChart}>
                        <Text style={styles.emptyEmoji}>📊</Text>
                        <Text style={styles.emptyTitle}>Pas encore de données</Text>
                        <Text style={styles.emptySubtitle}>
                            Commence à logger tes séances pour voir tes courbes !
                        </Text>
                    </View>
                )}
            </ScrollView>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: SPACING.lg, paddingTop: 60, paddingBottom: 100 },
    title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: SPACING.lg },
    viewTabs: {
        flexDirection: 'row', backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.sm, padding: 4, marginBottom: SPACING.md,
    },
    viewTab: {
        flex: 1, paddingVertical: SPACING.sm,
        alignItems: 'center', borderRadius: BORDER_RADIUS.sm - 2,
    },
    viewTabActive: { backgroundColor: colors.primary },
    viewTabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    viewTabTextActive: { color: '#FFFFFF' },
    exerciseSelector: { maxHeight: 48, marginBottom: SPACING.md },
    exChip: {
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
        borderRadius: BORDER_RADIUS.full, backgroundColor: colors.card,
        marginRight: SPACING.sm, borderWidth: 1, borderColor: colors.border,
    },
    exChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primary },
    exChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    exChipTextActive: { color: '#FFFFFF' },
    filterRow: {
        flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg,
        justifyContent: 'center',
    },
    filterChip: {
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
        borderRadius: BORDER_RADIUS.full, backgroundColor: colors.card,
        borderWidth: 1, borderColor: colors.border,
    },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
    filterTextActive: { color: '#FFFFFF' },
    chartContainer: {
        backgroundColor: colors.card, borderRadius: BORDER_RADIUS.md,
        padding: SPACING.sm, borderWidth: 1, borderColor: colors.border,
        overflow: 'hidden',
    },
    chart: { borderRadius: BORDER_RADIUS.md },
    chartLoading: {
        height: 260, justifyContent: 'center', alignItems: 'center',
        backgroundColor: colors.card, borderRadius: BORDER_RADIUS.md,
    },
    emptyChart: {
        backgroundColor: colors.card, borderRadius: BORDER_RADIUS.md,
        padding: SPACING.xxl, alignItems: 'center',
        borderWidth: 1, borderColor: colors.border,
    },
    emptyEmoji: { fontSize: 48, marginBottom: SPACING.md },
    emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: SPACING.sm },
    emptySubtitle: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
});
