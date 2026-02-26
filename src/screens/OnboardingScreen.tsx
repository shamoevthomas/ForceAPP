import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, BORDER_RADIUS } from '../constants/theme';
import { ExperienceLevel } from '../types';

const LEVELS: { key: ExperienceLevel; label: string; desc: string }[] = [
    { key: 'beginner', label: '🐣 Débutant', desc: '< 1.5 an' },
    { key: 'novice', label: '💪 Novice', desc: '1.5 à 3 ans' },
    { key: 'experienced', label: '🏆 Expérimenté', desc: '> 3 ans' },
];

export default function OnboardingScreen() {
    const { user, updateProfile } = useAuth();
    const { colors, isDark } = useTheme();
    const styles = createStyles(colors);
    const [step, setStep] = useState(0);
    const [username, setUsername] = useState('');
    const [birthDate, setBirthDate] = useState(''); // JJ/MM/AAAA
    const [heightCm, setHeightCm] = useState('');
    const [weight, setWeight] = useState('');
    const [level, setLevel] = useState<ExperienceLevel | null>(null);
    const [gender, setGender] = useState<'male' | 'female' | null>(null);
    const [loading, setLoading] = useState(false);

    const steps = [
        {
            title: 'Choisis ton pseudo',
            subtitle: 'Ce sera ton identité de guerrier. Choisis bien, il est définitif !',
            content: (
                <TextInput
                    style={styles.input}
                    placeholder="Ton pseudo"
                    placeholderTextColor={colors.textMuted}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    maxLength={20}
                />
            ),
            valid: username.length >= 3,
        },
        {
            title: 'Tes mensurations',
            subtitle: 'Ces données nous aident à personnaliser ton expérience.',
            content: (
                <View>
                    <Text style={styles.label}>Poids actuel (kg)</Text>
                    <TextInput
                        style={[styles.input, styles.weightInputLarge]}
                        placeholder="75"
                        placeholderTextColor={colors.textMuted}
                        value={weight}
                        onChangeText={setWeight}
                        keyboardType="numeric"
                        autoFocus
                    />

                    <View style={styles.row}>
                        <View style={styles.fullWidth}>
                            <Text style={styles.label}>Date de naissance (JJ/MM/AAAA)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="01/01/2000"
                                placeholderTextColor={colors.textMuted}
                                value={birthDate}
                                onChangeText={(text) => {
                                    // Auto-format JJ/MM/AAAA
                                    let cleaned = text.replace(/\D/g, '');
                                    let formatted = cleaned;
                                    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
                                    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
                                    setBirthDate(formatted);
                                }}
                                keyboardType="numeric"
                                maxLength={10}
                            />
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View style={styles.halfInput}>
                            <Text style={styles.label}>Taille (cm)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="178"
                                placeholderTextColor={colors.textMuted}
                                value={heightCm}
                                onChangeText={setHeightCm}
                                keyboardType="numeric"
                            />
                        </View>
                    </View>
                </View>
            ),
            valid: birthDate.length === 10 && heightCm.length > 0 && weight.length > 0,
        },
        {
            title: 'Ton sexe',
            subtitle: 'Important pour le calcul de ton métabolisme de base.',
            content: (
                <View style={styles.genderRow}>
                    <TouchableOpacity
                        style={[styles.genderCard, gender === 'male' && styles.levelCardActive]}
                        onPress={() => setGender('male')}
                    >
                        <Text style={styles.genderEmoji}>👨</Text>
                        <Text style={[styles.genderLabel, gender === 'male' && styles.levelLabelActive]}>Homme</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.genderCard, gender === 'female' && styles.levelCardActive]}
                        onPress={() => setGender('female')}
                    >
                        <Text style={styles.genderEmoji}>👩</Text>
                        <Text style={[styles.genderLabel, gender === 'female' && styles.levelLabelActive]}>Femme</Text>
                    </TouchableOpacity>
                </View>
            ),
            valid: gender !== null,
        },
        {
            title: 'Ton niveau',
            subtitle: "Sois honnête, c'est pour calibrer tes objectifs !",
            content: (
                <View>
                    {LEVELS.map((l) => (
                        <TouchableOpacity
                            key={l.key}
                            style={[styles.levelCard, level === l.key && styles.levelCardActive]}
                            onPress={() => setLevel(l.key)}
                        >
                            <Text style={[styles.levelLabel, level === l.key && styles.levelLabelActive]}>
                                {l.label}
                            </Text>
                            <Text style={styles.levelDesc}>{l.desc}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ),
            valid: level !== null,
        },
    ];

    const handleFinish = async () => {
        if (!user) return;

        // Function to calculate age from JJ/MM/AAAA
        const calculateAge = (dateStr: string) => {
            const [day, month, year] = dateStr.split('/').map(Number);
            const birth = new Date(year, month - 1, day);
            const today = new Date();
            let age = today.getFullYear() - birth.getFullYear();
            const m = today.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
                age--;
            }
            return age;
        };

        const [day, month, year] = birthDate.split('/');
        const isoBirthDate = `${year}-${month}-${day}`;

        setLoading(true);
        const { error } = await updateProfile({
            username,
            birth_date: isoBirthDate,
            age: calculateAge(birthDate),
            height_cm: parseFloat(heightCm),
            current_weight_kg: parseFloat(weight),
            experience_level: level!,
            gender: gender!,
        });
        setLoading(false);
        if (error) {
            Alert.alert('Erreur', error.message || 'Une erreur est survenue.');
        }
    };

    const currentStep = steps[step];

    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight]} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                {/* Progress */}
                <View style={styles.progressContainer}>
                    {steps.map((_, i) => (
                        <View
                            key={i}
                            style={[styles.progressDot, i <= step && styles.progressDotActive]}
                        />
                    ))}
                </View>

                <Text style={styles.title}>{currentStep.title}</Text>
                <Text style={styles.subtitle}>{currentStep.subtitle}</Text>

                <View style={styles.content}>{currentStep.content}</View>

                <View style={styles.nav}>
                    {step > 0 && (
                        <TouchableOpacity style={styles.backButton} onPress={() => setStep(step - 1)}>
                            <Text style={styles.backButtonText}>← Retour</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.nextButton, !currentStep.valid && styles.nextButtonDisabled]}
                        disabled={!currentStep.valid || loading}
                        onPress={() => {
                            if (step < steps.length - 1) {
                                setStep(step + 1);
                            } else {
                                handleFinish();
                            }
                        }}
                    >
                        <LinearGradient
                            colors={currentStep.valid ? [colors.primary, colors.accent] : [colors.textMuted, colors.textMuted]}
                            style={styles.nextButtonGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            {loading ? (
                                <ActivityIndicator color={colors.text} />
                            ) : (
                                <Text style={styles.nextButtonText}>
                                    {step < steps.length - 1 ? 'Suivant →' : "C'est parti ! 🚀"}
                                </Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1 },
    scroll: { flexGrow: 1, padding: SPACING.lg, paddingTop: 80 },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: SPACING.xl,
        gap: SPACING.sm,
    },
    progressDot: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: colors.border,
    },
    progressDotActive: { backgroundColor: colors.primary },
    title: {
        fontSize: 28, fontWeight: '800', color: colors.text,
        marginBottom: SPACING.xs,
    },
    subtitle: {
        fontSize: 15, color: colors.textSecondary,
        marginBottom: SPACING.xl, lineHeight: 22,
    },
    content: { flex: 1 },
    row: { flexDirection: 'row', gap: SPACING.md },
    halfInput: { flex: 1 },
    fullWidth: { width: '100%' },
    label: {
        color: colors.textSecondary, fontSize: 13,
        marginBottom: SPACING.xs, fontWeight: '600',
    },
    input: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.sm,
        padding: SPACING.md,
        color: colors.text,
        fontSize: 18,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    levelCard: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        borderWidth: 2,
        borderColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    levelCardActive: { borderColor: colors.primary, backgroundColor: colors.cardLight },
    levelLabel: { fontSize: 18, color: colors.text, fontWeight: '700' },
    levelLabelActive: { color: colors.primary },
    levelDesc: { fontSize: 14, color: colors.textSecondary },
    nav: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: SPACING.md,
        marginTop: SPACING.xl,
        paddingBottom: SPACING.xl,
    },
    backButton: {
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.lg,
        justifyContent: 'center',
    },
    backButtonText: { color: colors.textSecondary, fontSize: 16 },
    nextButton: { flex: 1, borderRadius: BORDER_RADIUS.sm, overflow: 'hidden' },
    nextButtonDisabled: { opacity: 0.5 },
    nextButtonGradient: {
        paddingVertical: SPACING.md,
        alignItems: 'center',
        borderRadius: BORDER_RADIUS.sm,
    },
    nextButtonText: { color: colors.text, fontSize: 16, fontWeight: '700' },
    weightInputLarge: {
        fontSize: 32,
        fontWeight: '800',
        borderColor: colors.primary,
        backgroundColor: colors.cardLight,
        textAlign: 'center',
    },
    genderRow: {
        flexDirection: 'row',
        gap: SPACING.md,
    },
    genderCard: {
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.xl,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.border,
    },
    genderEmoji: {
        fontSize: 40,
        marginBottom: SPACING.sm,
    },
    genderLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
});
