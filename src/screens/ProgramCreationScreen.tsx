import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, Alert, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { SPACING, BORDER_RADIUS } from '../constants/theme';
import { WeightIncrement } from '../types';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;

const WEEKDAYS = [
    { id: 1, label: 'Lundi' },
    { id: 2, label: 'Mardi' },
    { id: 3, label: 'Mercredi' },
    { id: 4, label: 'Jeudi' },
    { id: 5, label: 'Vendredi' },
    { id: 6, label: 'Samedi' },
    { id: 7, label: 'Dimanche' },
];

const INCREMENTS: WeightIncrement[] = ['1.25', '2.5', '3.75', '5', '6.25', '7.5', '8.75', '10'];


interface ExerciseInput {
    name: string;
    target_sets: string;
    target_reps: string;
    current_weight_kg: string;
    weight_increment: WeightIncrement;
}

interface DayInput {
    day_label: string;
    weekday_number: number;
    exercises: ExerciseInput[];
}

const defaultExercise = (): ExerciseInput => ({
    name: '', target_sets: '4', target_reps: '12',
    current_weight_kg: '0', weight_increment: '2.5',
});

interface ProgramCreationProps {
    onComplete: () => void;
    onBack?: () => void;
    initialData?: {
        id?: string;
        name: string;
        program_days: any[];
    };
}

export default function ProgramCreationScreen({ onComplete, onBack, initialData }: ProgramCreationProps) {
    const { user } = useAuth();
    const { colors, isDark } = useTheme();
    const styles = createStyles(colors);
    const [programName, setProgramName] = useState(initialData?.name || 'Mon Programme');
    const [days, setDays] = useState<DayInput[]>([]);

    useEffect(() => {
        if (initialData && initialData.program_days) {
            const formattedDays = initialData.program_days.map(d => ({
                day_label: d.day_label || '',
                weekday_number: d.day_number,
                exercises: d.exercises.map((e: any) => ({
                    name: e.name,
                    target_sets: String(e.target_sets),
                    target_reps: String(e.target_reps),
                    current_weight_kg: String(e.current_weight_kg),
                    weight_increment: e.weight_increment,
                }))
            }));
            setDays(formattedDays);
        } else {
            setDays([{ day_label: 'Push', weekday_number: 1, exercises: [defaultExercise()] }]);
        }
    }, [initialData]);

    const [hasExistingProgram, setHasExistingProgram] = useState(false);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanModal, setScanModal] = useState(false);

    // Modal state for day picking
    const [dayPickerVisible, setDayPickerVisible] = useState(false);
    const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);

    const [surchargePickerVisible, setSurchargePickerVisible] = useState(false);
    const [activeExInfo, setActiveExInfo] = useState<{ dayIndex: number, exIndex: number } | null>(null);

    useEffect(() => {
        checkExistingProgram();
    }, [user]);

    const checkExistingProgram = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('programs')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();
        if (data) setHasExistingProgram(true);
    };

    const addDay = () => {
        const usedWeekdays = days.map(d => d.weekday_number);
        let nextDay = 1;
        for (let i = 1; i <= 7; i++) {
            if (!usedWeekdays.includes(i)) {
                nextDay = i;
                break;
            }
        }

        setDays([...days, {
            day_label: '',
            weekday_number: nextDay,
            exercises: [defaultExercise()],
        }]);
    };

    const removeDay = (index: number) => {
        if (days.length <= 1) return;
        setDays(days.filter((_, i) => i !== index));
    };

    const openDayPicker = (index: number) => {
        setActiveDayIndex(index);
        setDayPickerVisible(true);
    };

    const selectWeekday = (weekdayId: number) => {
        if (activeDayIndex !== null) {
            updateDay(activeDayIndex, 'weekday_number', weekdayId);
        }
        setDayPickerVisible(false);
    };

    const openSurchargePicker = (dayIndex: number, exIndex: number) => {
        setActiveExInfo({ dayIndex, exIndex });
        setSurchargePickerVisible(true);
    };

    const selectSurcharge = (value: WeightIncrement) => {
        if (activeExInfo) {
            updateExercise(activeExInfo.dayIndex, activeExInfo.exIndex, 'weight_increment', value);
        }
        setSurchargePickerVisible(false);
    };

    const addExercise = (dayIndex: number) => {
        const newDays = [...days];
        newDays[dayIndex].exercises.push(defaultExercise());
        setDays(newDays);
    };

    const removeExercise = (dayIndex: number, exIndex: number) => {
        const newDays = [...days];
        if (newDays[dayIndex].exercises.length <= 1) return;
        newDays[dayIndex].exercises = newDays[dayIndex].exercises.filter((_, i) => i !== exIndex);
        setDays(newDays);
    };

    const updateDay = (dayIndex: number, field: string, value: any) => {
        setDays(prev => prev.map((day, i) =>
            i === dayIndex ? { ...day, [field]: value } : day
        ));
    };

    const updateExercise = (dayIndex: number, exIndex: number, field: string, value: string) => {
        setDays(prev => prev.map((day, dIdx) =>
            dIdx === dayIndex ? {
                ...day,
                exercises: day.exercises.map((ex, eIdx) =>
                    eIdx === exIndex ? { ...ex, [field]: value } : ex
                )
            } : day
        ));
    };

    const handleReset = async () => {
        Alert.alert(
            '🗑 Réinitialiser ?',
            'Ceci supprimera ton programme actuel.',
            [
                { text: 'Annuler', style: 'cancel' },
                {
                    text: 'Réinitialiser',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        const { error } = await supabase
                            .from('programs')
                            .delete()
                            .eq('user_id', user?.id)
                            .eq('is_active', true);
                        setLoading(false);
                        if (!error) {
                            setHasExistingProgram(false);
                            setDays([{ day_label: 'Push', weekday_number: 1, exercises: [defaultExercise()] }]);
                            setProgramName('Mon Programme');
                            Alert.alert('✅ Programme réinitialisé');
                        }
                    }
                }
            ]
        );
    };

    const handleScanProgram = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.5,
                base64: true, // Get base64 directly to avoid FileSystem issues
            });

            if (result.canceled || !result.assets[0].base64) return;

            setScanModal(true);
            setScanning(true);

            const base64Image = result.assets[0].base64;

            console.log("Starting API call to Groq...");
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-4-scout-17b-16e-instruct",
                    messages: [
                        {
                            role: "system",
                            content: `Tu es un assistant expert en musculation et vision. Ton unique but est de renvoyer du JSON valide.
                            Structure attendue :
                            {
                              "program_name": "...",
                              "program": [
                                {
                                  "day_label": "Sous-titre de la séance (ex: Push, Pull, Leg Day)",
                                  "weekday_number": 1-7 (1=Lundi, 7=Dimanche),
                                  "exercises": [
                                    { "name": "...", "sets": 4, "reps": 12, "weight": 0 }
                                  ]
                                }
                              ]
                            }`
                        },
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "Analyse ce programme et convertis-le en JSON." },
                                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
                            ],
                        },
                    ],
                    response_format: { type: "json_object" },
                }),
            });

            const resultJson = await response.json();
            console.log("Groq API Response Status:", response.status);

            if (!response.ok) {
                console.error("Groq API Error:", resultJson);
                throw new Error(resultJson.error?.message || "Erreur API Groq");
            }

            const content = resultJson.choices?.[0]?.message?.content;
            if (!content) throw new Error("Aucun contenu reçu de l'IA.");

            console.log("Raw Vision Response received");
            const data = JSON.parse(content);

            if (data.program_name) setProgramName(data.program_name);

            const formattedDays = (data.program || []).map((d: any, i: number) => ({
                day_label: d.day_label || '',
                weekday_number: parseInt(d.weekday_number) || (i + 1),
                exercises: (d.exercises || []).map((e: any) => ({
                    name: e.name || 'Inconnu',
                    target_sets: String(e.sets || 4),
                    target_reps: String(e.reps || 12),
                    current_weight_kg: String(e.weight || 0),
                    weight_increment: '2.5',
                })),
            }));

            if (formattedDays.length > 0) setDays(formattedDays);

            setScanning(false);
            setScanModal(false);
            Alert.alert('✅ Analyse terminée');
        } catch (err: any) {
            console.error("Scanner Error Details:", err);
            setScanning(false);
            setScanModal(false);
            Alert.alert('Erreur', err.message || 'Impossible de scanner le programme.');
        }
    };

    const handleSave = async () => {
        if (!user) return;
        if (!programName.trim()) { Alert.alert('Erreur', 'Nom requis'); return; }

        setLoading(true);
        try {
            let programId: string;

            if (initialData?.id) {
                // Editing existing program
                programId = initialData.id;
                const { error: updateError } = await supabase
                    .from('programs')
                    .update({ name: programName })
                    .eq('id', programId);
                if (updateError) throw updateError;

                // Clean up old days and exercises (Cascade delete should handle exercises)
                const { error: deleteError } = await supabase
                    .from('program_days')
                    .delete()
                    .eq('program_id', programId);
                if (deleteError) throw deleteError;
            } else {
                // Creating new program
                // 1. Deactivate others
                await supabase.from('programs').update({ is_active: false }).eq('user_id', user.id);
                // 2. Insert new
                const { data: program, error: progError } = await supabase
                    .from('programs')
                    .insert({ user_id: user.id, name: programName, is_active: true })
                    .select().single();
                if (progError) throw progError;
                programId = program.id;
            }

            // Insert new days and exercises
            for (const day of days) {
                const { data: programDay, error: dayError } = await supabase
                    .from('program_days')
                    .insert({ program_id: programId, day_number: day.weekday_number, day_label: day.day_label })
                    .select().single();
                if (dayError) throw dayError;

                const exercises = day.exercises.map((ex, j) => ({
                    program_day_id: programDay.id,
                    name: ex.name,
                    target_sets: parseInt(ex.target_sets) || 4,
                    target_reps: parseInt(ex.target_reps) || 12,
                    current_weight_kg: parseFloat(ex.current_weight_kg) || 0,
                    weight_increment: ex.weight_increment,
                    sort_order: j,
                }));
                const { error: exError } = await supabase.from('exercises').insert(exercises);
                if (exError) throw exError;
            }

            onComplete();
        } catch (err: any) {
            Alert.alert('Erreur', err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight]} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={styles.navHeader}>
                    {onBack && (
                        <TouchableOpacity style={styles.backButtonTop} onPress={onBack}>
                            <Text style={styles.backButtonText}>⬅️ Retour</Text>
                        </TouchableOpacity>
                    )}
                    {hasExistingProgram && (
                        <TouchableOpacity style={styles.resetHeaderBtn} onPress={handleReset}>
                            <Text style={styles.resetHeaderText}>🗑 Réinitialiser</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <Text style={styles.pageTitle}>{initialData ? '✍️ Modifier le programme' : '📋 Créer ton programme'}</Text>

                <TouchableOpacity style={styles.scanButton} onPress={handleScanProgram}>
                    <LinearGradient colors={['#FF6B6B', '#FF8E53']} style={styles.scanButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                        <Text style={styles.scanButtonText}>📸 Scanner mon programme</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <Text style={styles.label}>Nom du programme</Text>
                <TextInput style={styles.input} value={programName} onChangeText={setProgramName} placeholderTextColor={colors.textMuted} />

                {days.map((day, dayIndex) => (
                    <View key={dayIndex} style={styles.dayCard}>
                        <View style={styles.dayTopRow}>
                            <TouchableOpacity style={styles.dayPickerBtn} onPress={() => openDayPicker(dayIndex)}>
                                <Text style={styles.dayPickerLabel}>Jour</Text>
                                <Text style={styles.dayPickerValue}>{WEEKDAYS.find(w => w.id === day.weekday_number)?.label || 'Choisir'}</Text>
                            </TouchableOpacity>
                            <TextInput
                                style={styles.subtitleInput}
                                value={day.day_label}
                                onChangeText={(v) => updateDay(dayIndex, 'day_label', v)}
                                placeholder="Sous-titre (ex: Push)"
                                placeholderTextColor={colors.textMuted}
                            />
                            <TouchableOpacity style={styles.removeDayBtn} onPress={() => removeDay(dayIndex)}>
                                <Text style={styles.removeDayText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {day.exercises.map((ex, exIndex) => (
                            <View key={exIndex} style={styles.exerciseCard}>
                                <View style={styles.exerciseHeader}>
                                    <TextInput style={styles.exerciseNameInput} placeholder="Nom de l'exercice" value={ex.name} onChangeText={(v) => updateExercise(dayIndex, exIndex, 'name', v)} placeholderTextColor={colors.textMuted} />
                                    <TouchableOpacity onPress={() => removeExercise(dayIndex, exIndex)}><Text style={styles.deleteExText}>✕</Text></TouchableOpacity>
                                </View>
                                <View style={styles.exerciseRow}>
                                    <View style={styles.miniField}>
                                        <Text style={styles.miniLabel}>Sets</Text>
                                        <TextInput style={styles.miniInput} value={ex.target_sets} onChangeText={(v) => updateExercise(dayIndex, exIndex, 'target_sets', v)} keyboardType="numeric" />
                                    </View>
                                    <View style={styles.miniField}>
                                        <Text style={styles.miniLabel}>Reps</Text>
                                        <TextInput style={styles.miniInput} value={ex.target_reps} onChangeText={(v) => updateExercise(dayIndex, exIndex, 'target_reps', v)} keyboardType="numeric" />
                                    </View>
                                    <View style={[styles.field, { flex: 2 }]}>
                                        <Text style={styles.miniLabel}>Surcharge (kg)</Text>
                                        <TouchableOpacity
                                            style={styles.dropdownBtn}
                                            onPress={() => openSurchargePicker(dayIndex, exIndex)}
                                        >
                                            <Text style={styles.dropdownValue}>+{ex.weight_increment} kg</Text>
                                            <Text style={styles.dropdownArrow}>▼</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ))}
                        <TouchableOpacity style={styles.addExButton} onPress={() => addExercise(dayIndex)}><Text style={styles.addExText}>+ Ajouter un exercice</Text></TouchableOpacity>
                    </View>
                ))}

                <TouchableOpacity style={styles.addDayButton} onPress={addDay}><Text style={styles.addDayText}>+ Ajouter une séance</Text></TouchableOpacity>

                <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
                    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.saveGradient}>
                        {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.saveButtonText}>💾 Sauver mon programme</Text>}
                    </LinearGradient>
                </TouchableOpacity>

                {hasExistingProgram && (
                    <TouchableOpacity style={styles.resetBottomBtn} onPress={handleReset}>
                        <Text style={styles.resetBottomText}>🗑 Réinitialiser tout le programme</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* Day Picker Modal */}
            <Modal visible={dayPickerVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.pickerContent}>
                        <Text style={styles.pickerTitle}>Sélectionner un jour</Text>
                        <FlatList
                            data={WEEKDAYS}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.pickerRow} onPress={() => selectWeekday(item.id)}>
                                    <Text style={styles.pickerRowText}>{item.label}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity style={styles.pickerClose} onPress={() => setDayPickerVisible(false)}>
                            <Text style={styles.pickerCloseText}>Annuler</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Surcharge Picker Modal */}
            <Modal visible={surchargePickerVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.pickerContent}>
                        <Text style={styles.pickerTitle}>Surcharge (kg)</Text>
                        <FlatList
                            data={INCREMENTS}
                            keyExtractor={(item) => item}
                            numColumns={2}
                            columnWrapperStyle={{ gap: 10 }}
                            contentContainerStyle={{ gap: 10 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.surchargeGridItem,
                                        activeExInfo && days[activeExInfo.dayIndex].exercises[activeExInfo.exIndex].weight_increment === item && styles.surchargeGridItemActive
                                    ]}
                                    onPress={() => selectSurcharge(item)}
                                >
                                    <Text style={[
                                        styles.surchargeGridText,
                                        activeExInfo && days[activeExInfo.dayIndex].exercises[activeExInfo.exIndex].weight_increment === item && styles.surchargeGridTextActive
                                    ]}>
                                        +{item} kg
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity style={styles.pickerClose} onPress={() => setSurchargePickerVisible(false)}>
                            <Text style={styles.pickerCloseText}>Annuler</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Scanning Modal */}
            <Modal visible={scanModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={styles.modalText}>Analyse intelligente...</Text>
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: SPACING.lg, paddingTop: 50, paddingBottom: 150 },
    navHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.md
    },
    field: { flex: 1 },
    backButtonTop: {
        paddingVertical: 4,
    },
    backButtonText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: '700'
    },
    pageTitle: {
        fontSize: 26,
        fontWeight: '900',
        color: colors.text,
        marginBottom: SPACING.xl,
    },
    resetHeaderBtn: { paddingVertical: 4 },
    resetHeaderText: { color: colors.error, fontSize: 13, fontWeight: '600' },

    scanButton: { borderRadius: BORDER_RADIUS.sm, overflow: 'hidden', marginBottom: SPACING.lg },
    scanButtonGradient: { paddingVertical: SPACING.md, alignItems: 'center' },
    scanButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: SPACING.xs },
    input: { backgroundColor: colors.card, borderRadius: BORDER_RADIUS.sm, padding: SPACING.md, color: colors.text, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.border },

    dayCard: { backgroundColor: colors.card, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: colors.border },
    dayTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
    dayPickerBtn: {
        backgroundColor: colors.backgroundLight,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        minWidth: 90,
    },
    dayPickerLabel: { fontSize: 9, color: colors.textSecondary, fontWeight: '700', textTransform: 'uppercase' },
    dayPickerValue: { fontSize: 13, color: colors.primary, fontWeight: '800', marginTop: 1 },
    subtitleInput: {
        flex: 1,
        backgroundColor: colors.backgroundLight,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
    },
    removeDayBtn: { padding: 4 },
    removeDayText: { color: colors.error, fontSize: 20 },

    exerciseCard: { backgroundColor: colors.backgroundLight, borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.sm },
    exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
    exerciseNameInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
    deleteExText: { color: colors.error, fontSize: 16 },
    exerciseRow: { flexDirection: 'row', gap: SPACING.md },
    miniField: { flex: 1 },
    miniLabel: { color: colors.textMuted, fontSize: 9, marginBottom: 2 },
    miniInput: { backgroundColor: colors.card, borderRadius: 4, padding: 4, color: colors.text, fontSize: 12, textAlign: 'center', borderWidth: 1, borderColor: colors.border },

    dropdownBtn: {
        backgroundColor: colors.card,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dropdownValue: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.primary,
    },
    dropdownArrow: {
        fontSize: 10,
        color: colors.textSecondary,
    },

    surchargeGridItem: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: colors.backgroundLight,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    surchargeGridItemActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    surchargeGridText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },
    surchargeGridTextActive: {
        color: '#FFFFFF',
    },

    addExButton: { paddingVertical: SPACING.xs, alignItems: 'center' },
    addExText: { color: colors.primary, fontSize: 13, fontWeight: '600' },

    addDayButton: { paddingVertical: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.lg },
    addDayText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    saveButton: { borderRadius: BORDER_RADIUS.sm, overflow: 'hidden' },
    saveGradient: { paddingVertical: SPACING.md, alignItems: 'center' },
    saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

    resetBottomBtn: { marginTop: SPACING.xl, paddingVertical: SPACING.md, alignItems: 'center' },
    resetBottomText: { color: colors.error, fontSize: 13, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: colors.card, borderRadius: BORDER_RADIUS.lg, padding: SPACING.xl, alignItems: 'center' },
    modalText: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: SPACING.md },

    pickerContent: { backgroundColor: colors.card, borderRadius: BORDER_RADIUS.lg, width: '80%', padding: SPACING.lg, maxHeight: '60%' },
    pickerTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: SPACING.md, textAlign: 'center' },
    pickerRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border + '40' },
    pickerRowText: { fontSize: 16, color: colors.text, textAlign: 'center' },
    pickerClose: { marginTop: SPACING.md, padding: SPACING.sm },
    pickerCloseText: { color: colors.error, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
