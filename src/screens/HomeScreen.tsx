import React, { useEffect, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Alert, RefreshControl, Image, Modal, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { SPACING, BORDER_RADIUS, GRADE_EMOJIS } from '../constants/theme';

export default function HomeScreen() {
    const { profile, user, refreshProfile, updateProfile } = useAuth();
    const { colors, isDark } = useTheme();
    const styles = createStyles(colors);
    const [streak, setStreak] = useState(0);
    const [grade, setGrade] = useState('Gringalet');
    const [editingWeight, setEditingWeight] = useState(false);
    const [weightInput, setWeightInput] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [todaySession, setTodaySession] = useState<string | null>(null);
    const [totalVolume, setTotalVolume] = useState(0);
    const [podiumVisible, setPodiumVisible] = useState(false);

    const GRADE_THRESHOLDS = [
        { name: 'Gringalet', volume: 0, emoji: '🐣' },
        { name: 'Crevette', volume: 10000, emoji: '🦐' },
        { name: 'Costaud', volume: 50000, emoji: '💪' },
        { name: 'Guerrier', volume: 150000, emoji: '⚔️' },
        { name: 'Machine', volume: 500000, emoji: '🤖' },
        { name: 'Titan', volume: 1000000, emoji: '🏛️' },
        { name: 'Hulk', volume: 2500000, emoji: '💚' },
    ];

    const fetchStats = useCallback(async () => {
        if (!user) return;

        // Calculate streak
        const { data: streakData } = await supabase.rpc('calculate_streak', { p_user_id: user.id });
        if (streakData !== null) setStreak(streakData);

        // Calculate grade
        const { data: gradeData } = await supabase.rpc('calculate_force_grade', { p_user_id: user.id });
        if (gradeData) setGrade(gradeData);

        // Fetch today's session from active program
        const dayOfWeek = (new Date().getDay() + 6) % 7; // 0=Mon, 6=Sun
        const { data: programData } = await supabase
            .from('programs')
            .select('program_days(day_number, day_label)')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();

        if (programData?.program_days) {
            const daysArr = Array.isArray(programData.program_days) ? programData.program_days : [];
            const today = (daysArr as any[]).find(d => d.day_number === dayOfWeek + 1);
            setTodaySession(today ? (today.day_label || `Jour ${today.day_number}`) : 'Repos 😴');
        } else {
            setTodaySession('Repos 😴');
        }

        // Fetch Total Volume
        const { data: volData } = await supabase
            .from('workout_sets')
            .select('weight_kg, reps, workout_log:workout_logs!inner(user_id)')
            .eq('workout_log.user_id', user.id);

        if (volData) {
            const total = volData.reduce((acc, curr) => acc + (curr.weight_kg * curr.reps), 0);
            setTotalVolume(total);
        }

        await refreshProfile();
    }, [user, refreshProfile]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchStats();
        setRefreshing(false);
    };

    const saveWeight = async () => {
        const w = parseFloat(weightInput);
        if (isNaN(w)) return;
        await updateProfile({ current_weight_kg: w });
        setEditingWeight(false);
    };

    const getGradeColor = (g: string) => {
        const key = `grade${g}` as keyof typeof colors;
        return (colors as any)[key] || colors.textMuted;
    };

    const gradeColor = getGradeColor(grade);
    const gradeEmoji = GRADE_EMOJIS[grade] || '💪';

    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight]} style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
                {/* Header: Salut [Pseudo] + PP small on right */}
                <View style={styles.header}>
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.greeting}>Salut {profile?.username || 'Guerrier'} 👋</Text>
                        <Text style={styles.headerSub}>Ta force n'attend que toi.</Text>
                    </View>
                    <TouchableOpacity style={styles.avatarMiniContainer}>
                        {profile?.avatar_url ? (
                            <Image source={{ uri: profile.avatar_url }} style={styles.avatarMini} />
                        ) : (
                            <View style={[styles.avatarMini, styles.avatarPlaceholder]}>
                                <Text style={styles.avatarTextMini}>{profile?.username?.charAt(0).toUpperCase() || '?'}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Bubble Row: Consecutive Days & Weight */}
                <View style={styles.bubblesRow}>
                    <View style={styles.bubble}>
                        <Text style={styles.bubbleEmoji}>🔥</Text>
                        <View>
                            <Text style={styles.bubbleValue}>{streak}</Text>
                            <Text style={styles.bubbleLabel}>jours consécutifs</Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.bubble}
                        onPress={() => {
                            setWeightInput(profile?.current_weight_kg?.toString() || '');
                            setEditingWeight(!editingWeight);
                        }}
                    >
                        <Text style={styles.bubbleEmoji}>⚖️</Text>
                        <View>
                            {editingWeight ? (
                                <View style={styles.weightEditInline}>
                                    <TextInput
                                        style={styles.weightInputSmall}
                                        value={weightInput}
                                        onChangeText={setWeightInput}
                                        keyboardType="numeric"
                                        autoFocus
                                        onBlur={saveWeight}
                                        onSubmitEditing={saveWeight}
                                    />
                                    <Text style={styles.bubbleLabel}>kg (appuie OK)</Text>
                                </View>
                            ) : (
                                <>
                                    <Text style={styles.bubbleValue}>{profile?.current_weight_kg?.toFixed(1) || '—'}</Text>
                                    <Text style={styles.bubbleLabel}>poids (kg)</Text>
                                </>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Grade Card - Large Cell */}
                <View style={styles.largeCard}>
                    <LinearGradient
                        colors={[isDark ? colors.card : colors.backgroundLight, isDark ? '#1A1A3E' : '#F1F3F5']}
                        style={styles.cardGradient}
                    >
                        <View style={styles.cardHeaderRow}>
                            <Text style={styles.cardLabel}>Grade de Force</Text>
                            <TouchableOpacity style={styles.podiumBtn} onPress={() => setPodiumVisible(true)}>
                                <Text style={styles.podiumIcon}>🏆</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.gradeCenter}>
                            <Text style={styles.gradeEmojiLarge}>{gradeEmoji}</Text>
                            <Text style={[styles.gradeValue, { color: gradeColor }]}>{grade.toUpperCase()}</Text>
                            <Text style={styles.volumeText}>{totalVolume.toLocaleString()} kg total</Text>
                        </View>
                        <View style={styles.gradeProgressBg}>
                            <View
                                style={[
                                    styles.gradeProgressFill,
                                    {
                                        backgroundColor: gradeColor,
                                        width: `${Math.min(100, (totalVolume / (GRADE_THRESHOLDS.find((t, i) => {
                                            const currentIdx = GRADE_THRESHOLDS.findIndex(gt => gt.name === grade);
                                            return i === currentIdx + 1;
                                        })?.volume || totalVolume)) * 100)}%`
                                    }
                                ]}
                            />
                        </View>
                    </LinearGradient>
                </View>

                {/* Podium Modal */}
                <Modal visible={podiumVisible} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Grades de Force 🏆</Text>
                                <TouchableOpacity onPress={() => setPodiumVisible(false)}>
                                    <Text style={styles.closeModal}>Fermer</Text>
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={GRADE_THRESHOLDS}
                                keyExtractor={(item) => item.name}
                                renderItem={({ item, index }) => {
                                    const isUnlocked = totalVolume >= item.volume;
                                    const isCurrent = grade === item.name;
                                    return (
                                        <View style={[
                                            styles.gradeRow,
                                            isCurrent && { backgroundColor: gradeColor + '20', borderRadius: 12 }
                                        ]}>
                                            <Text style={styles.gradeRowEmoji}>{item.emoji}</Text>
                                            <View style={styles.gradeRowInfo}>
                                                <Text style={[
                                                    styles.gradeRowName,
                                                    !isUnlocked && { color: colors.textMuted },
                                                    isCurrent && { color: gradeColor }
                                                ]}>
                                                    {item.name} {isCurrent && ' (Actuel)'}
                                                </Text>
                                                <Text style={styles.gradeRowVolume}>
                                                    {item.volume.toLocaleString()} kg
                                                </Text>
                                            </View>
                                            {isUnlocked ? (
                                                <Text style={styles.unlockIcon}>✅</Text>
                                            ) : (
                                                <Text style={styles.unlockIcon}>🔒</Text>
                                            )}
                                        </View>
                                    );
                                }}
                            />
                        </View>
                    </View>
                </Modal>

                {/* Today Session Card - Large Cell Bottom */}
                <View style={[styles.largeCard, styles.sessionCard]}>
                    <TouchableOpacity style={styles.sessionInner}>
                        <View style={styles.sessionHeader}>
                            <Text style={styles.sessionLabel}>Séance du jour</Text>
                            <Text style={styles.sessionStatusBadge}>{todaySession === 'Repos 😴' ? 'REPOS' : 'À FAIRE'}</Text>
                        </View>
                        <Text style={styles.sessionTitle}>{todaySession}</Text>
                        <Text style={styles.sessionSubtext}>
                            {todaySession === 'Repos 😴' ? 'Récupère bien pour demain !' : 'C\'est le moment de tout donner.'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.footerBranding}>Product By Thomas Shamoev</Text>
            </ScrollView>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: SPACING.lg, paddingTop: 60, paddingBottom: 100 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.xl,
    },
    headerTextContainer: { flex: 1 },
    greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
    avatarMiniContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: colors.primary,
        overflow: 'hidden',
        marginLeft: SPACING.md,
    },
    avatarMini: { width: '100%', height: '100%' },
    avatarPlaceholder: {
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center'
    },
    avatarTextMini: { color: colors.primary, fontSize: 18, fontWeight: '800' },

    bubblesRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.lg },
    bubble: {
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        borderWidth: 1,
        borderColor: colors.border,
        height: 70,
    },
    bubbleEmoji: { fontSize: 24 },
    bubbleValue: { fontSize: 20, fontWeight: '800', color: colors.text },
    bubbleLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase' },

    weightEditInline: { flexDirection: 'column' },
    weightInputSmall: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.primary,
        padding: 0,
        height: 22,
    },

    largeCard: {
        borderRadius: BORDER_RADIUS.xl,
        overflow: 'hidden',
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardGradient: { padding: SPACING.xl, alignItems: 'center', paddingTop: SPACING.lg },
    cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: SPACING.sm },
    podiumBtn: { backgroundColor: colors.border + '30', padding: 8, borderRadius: 12 },
    podiumIcon: { fontSize: 18 },
    cardLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    gradeCenter: { alignItems: 'center', marginBottom: SPACING.md },
    gradeEmojiLarge: { fontSize: 60, marginBottom: SPACING.xs },
    gradeValue: { fontSize: 32, fontWeight: '900', letterSpacing: 2 },
    volumeText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 4 },
    gradeProgressBg: {
        width: '100%',
        height: 6,
        backgroundColor: colors.border + '40',
        borderRadius: 3,
        overflow: 'hidden'
    },
    gradeProgressFill: { height: '100%', borderRadius: 3 },

    sessionCard: { backgroundColor: colors.card, borderWidth: 1 },
    sessionInner: { padding: SPACING.xl },
    sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
    sessionLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
    sessionStatusBadge: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
        backgroundColor: colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden'
    },
    sessionTitle: { fontSize: 26, fontWeight: '800', color: colors.text },
    sessionSubtext: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    footerBranding: { textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: SPACING.xl, opacity: 0.6 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: SPACING.xl, height: '70%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
    closeModal: { color: colors.primary, fontWeight: '700' },
    gradeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, gap: 15 },
    gradeRowEmoji: { fontSize: 24 },
    gradeRowInfo: { flex: 1 },
    gradeRowName: { fontSize: 16, fontWeight: '800', color: colors.text },
    gradeRowVolume: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    unlockIcon: { fontSize: 16 },
});
