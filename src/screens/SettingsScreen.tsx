import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Image, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { SPACING, BORDER_RADIUS } from '../constants/theme';

type ModalConfig = {
    title: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
    destructive?: boolean;
};

export default function SettingsScreen() {
    const { user, profile, signOut, updateProfile, refreshProfile } = useAuth();
    const { colors, isDark, toggleTheme } = useTheme();
    const styles = createStyles(colors);
    const [weight, setWeight] = useState(profile?.current_weight_kg?.toString() || '');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [birthDate, setBirthDate] = useState(() => {
        if (!profile?.birth_date) return '';
        const [y, m, d] = profile.birth_date.split('-');
        return `${d}/${m}/${y}`;
    });
    const [modal, setModal] = useState<ModalConfig | null>(null);

    const showAlert = (title: string, message: string) => setModal({ title, message });
    const showConfirm = (
        title: string,
        message: string,
        confirmText: string,
        onConfirm: () => void,
        destructive = false,
    ) => setModal({ title, message, confirmText, onConfirm, destructive });

    const calculateAge = (dateStr: string) => {
        if (dateStr.length < 10) return null;
        const [day, month, year] = dateStr.split('/').map(Number);
        if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
        const birth = new Date(year, month - 1, day);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const [newPassword, setNewPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [resetting, setResetting] = useState(false);

    const handleSaveWeight = async () => {
        const w = parseFloat(weight);
        if (isNaN(w)) return;

        let ageUpdate = {};
        let birthUpdate = {};

        if (birthDate.length === 10) {
            const [d, m, y] = birthDate.split('/');
            birthUpdate = { birth_date: `${y}-${m}-${d}` };
            const age = calculateAge(birthDate);
            if (age !== null) ageUpdate = { age };
        }

        setSaving(true);
        await updateProfile({
            current_weight_kg: w,
            ...birthUpdate,
            ...ageUpdate
        });
        setSaving(false);
        showAlert('✅ Profil mis à jour', '');
    };

    const handlePickAvatar = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
            });

            if (result.canceled || !result.assets[0]) return;

            setUploading(true);
            const uri = result.assets[0].uri;
            const ext = uri.split('.').pop() || 'jpg';
            const fileName = `${user?.id}/avatar.${ext}`;

            const response = await fetch(uri);
            const blob = await response.blob();
            const arrayBuffer = await new Response(blob).arrayBuffer();

            const { error } = await supabase.storage
                .from('avatars')
                .upload(fileName, arrayBuffer, {
                    contentType: `image/${ext}`,
                    upsert: true,
                });

            if (error) throw error;

            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(fileName);

            const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
            await updateProfile({ avatar_url: avatarUrl });
            setUploading(false);
            showAlert('✅ Photo mise à jour', '');
        } catch (err: any) {
            setUploading(false);
            showAlert('Erreur', err.message);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword.length < 6) {
            showAlert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères.');
            return;
        }
        setChangingPassword(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        setChangingPassword(false);
        if (error) {
            showAlert('Erreur', error.message);
        } else {
            setNewPassword('');
            showAlert('✅ Mot de passe changé', '');
        }
    };

    const handleSignOut = () => {
        showConfirm(
            'Déconnexion',
            'Tu es sûr de vouloir te déconnecter ?',
            'Déconnexion',
            signOut,
        );
    };

    const handleResetData = () => {
        showConfirm(
            '🔄 Remettre à zéro',
            'Cette action supprimera tous tes entraînements et programmes.\n\nTes informations de profil (pseudo, âge, niveau, photo) seront conservées.',
            'Réinitialiser',
            () => {
                showConfirm(
                    'Dernière confirmation',
                    "Tous tes programmes et historiques d'entraînement seront effacés. Cette action est irréversible.",
                    'Oui, remettre à zéro',
                    async () => {
                        setResetting(true);
                        const { error } = await supabase.rpc('reset_user_data');
                        setResetting(false);
                        if (error) {
                            showAlert('Erreur', error.message || 'Impossible de réinitialiser les données.');
                            return;
                        }
                        showAlert('✅ Remis à zéro', 'Tes entraînements et programmes ont été supprimés.');
                    },
                    true,
                );
            },
        );
    };

    const handleDeleteAccount = () => {
        showConfirm(
            '⚠️ Supprimer le compte',
            'Cette action est IRRÉVERSIBLE. Toutes tes données (entraînements, programmes, photos) seront définitivement supprimées.',
            'Supprimer définitivement',
            () => {
                showConfirm(
                    'Dernière confirmation',
                    'Es-tu vraiment sûr ? Cette opération est irréversible.',
                    'Oui, supprimer',
                    async () => {
                        setDeleting(true);
                        const { error } = await supabase.rpc('delete_user_account');
                        if (error) {
                            setDeleting(false);
                            showAlert('Erreur', error.message || 'Impossible de supprimer le compte.');
                            return;
                        }
                        await signOut();
                    },
                    true,
                );
            },
            true,
        );
    };

    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight]} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <Text style={[styles.title, { color: colors.text }]}>⚙️ Paramètres</Text>

                {/* Theme Section */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>Apparence</Text>
                    <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Mode Clair (Force White)</Text>
                        <TouchableOpacity
                            style={[styles.themeToggle, !isDark && styles.themeToggleActive]}
                            onPress={toggleTheme}
                        >
                            <View style={[styles.themeToggleCircle, !isDark && styles.themeToggleCircleActive]} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Profile Section */}
                <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>Profil</Text>

                    {/* Avatar */}
                    <TouchableOpacity style={styles.avatarContainer} onPress={handlePickAvatar} disabled={uploading}>
                        {profile?.avatar_url ? (
                            <Image
                                source={{ uri: profile.avatar_url }}
                                style={styles.avatar}
                                onError={(e) => console.log("Avatar image error:", e.nativeEvent.error)}
                            />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>
                                    {profile?.username?.charAt(0).toUpperCase() || '?'}
                                </Text>
                            </View>
                        )}
                        {uploading ? (
                            <ActivityIndicator color={colors.primary} style={styles.avatarOverlay} />
                        ) : (
                            <View style={styles.avatarBadge}>
                                <Text style={styles.avatarBadgeText}>📷</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Pseudo</Text>
                        <Text style={styles.infoValue}>{profile?.username || '—'}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Âge (calculé)</Text>
                        <Text style={styles.infoValue}>{profile?.age ? `${profile.age} ans` : '—'}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Niveau</Text>
                        <Text style={styles.infoValue}>
                            {profile?.experience_level === 'beginner' ? '🐣 Débutant' :
                                profile?.experience_level === 'novice' ? '💪 Novice' :
                                    profile?.experience_level === 'experienced' ? '🏆 Expérimenté' : '—'}
                        </Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Sexe</Text>
                        <View style={styles.genderToggle}>
                            <TouchableOpacity
                                disabled={saving}
                                style={[styles.genderMiniBtn, profile?.gender === 'male' && styles.genderMiniBtnActive]}
                                onPress={async () => {
                                    setSaving(true);
                                    const { error } = await updateProfile({ gender: 'male' });
                                    setSaving(false);
                                    if (error) showAlert('Erreur', error.message);
                                }}
                            >
                                <Text style={styles.genderMiniText}>👨 H</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                disabled={saving}
                                style={[styles.genderMiniBtn, profile?.gender === 'female' && styles.genderMiniBtnActive]}
                                onPress={async () => {
                                    setSaving(true);
                                    const { error } = await updateProfile({ gender: 'female' });
                                    setSaving(false);
                                    if (error) showAlert('Erreur', error.message);
                                }}
                            >
                                <Text style={styles.genderMiniText}>👩 F</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Info Physiques Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Infos Physiques</Text>

                    <Text style={styles.infoLabel}>Date de naissance (JJ/MM/AAAA)</Text>
                    <TextInput
                        style={[styles.input, { marginTop: 8 }]}
                        value={birthDate}
                        onChangeText={(text) => {
                            let cleaned = text.replace(/\D/g, '');
                            let formatted = cleaned;
                            if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
                            if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
                            setBirthDate(formatted);
                        }}
                        placeholder="01/01/2000"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        maxLength={10}
                    />

                    <Text style={[styles.infoLabel, { marginTop: 8 }]}>Poids corporel (kg)</Text>
                    <View style={styles.weightRow}>
                        <TextInput
                            style={styles.weightInput}
                            value={weight}
                            onChangeText={setWeight}
                            keyboardType="numeric"
                            placeholder="75"
                            placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity style={styles.weightSave} onPress={handleSaveWeight} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator size="small" color={colors.text} />
                            ) : (
                                <Text style={styles.weightSaveText}>💾</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Password Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Mot de passe</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Nouveau mot de passe"
                        placeholderTextColor={colors.textMuted}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                    />
                    <TouchableOpacity
                        style={styles.changePasswordButton}
                        onPress={handleChangePassword}
                        disabled={changingPassword || !newPassword}
                    >
                        {changingPassword ? (
                            <ActivityIndicator color={colors.text} />
                        ) : (
                            <Text style={styles.changePasswordText}>Changer le mot de passe</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Actions */}
                <View style={styles.section}>
                    <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
                        <Text style={styles.logoutText}>🚪 Se déconnecter</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.resetButton, resetting && { opacity: 0.6 }]}
                        onPress={handleResetData}
                        disabled={resetting}
                    >
                        {resetting ? (
                            <ActivityIndicator color="#F59E0B" />
                        ) : (
                            <Text style={styles.resetText}>🔄 Remettre à zéro</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.deleteButton, deleting && { opacity: 0.6 }]}
                        onPress={handleDeleteAccount}
                        disabled={deleting}
                    >
                        {deleting ? (
                            <ActivityIndicator color={colors.error} />
                        ) : (
                            <Text style={styles.deleteText}>🗑 Supprimer mon compte</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <Text style={styles.footerBranding}>Product By Thomas Shamoev</Text>
            </ScrollView>

            {/* Custom Modal — remplace Alert.alert (bloqué sur iOS PWA) */}
            <Modal
                visible={modal !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setModal(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>{modal?.title}</Text>
                        {!!modal?.message && (
                            <Text style={[styles.modalMessage, { color: colors.textSecondary }]}>{modal.message}</Text>
                        )}
                        <View style={styles.modalButtons}>
                            {modal?.confirmText ? (
                                <>
                                    <TouchableOpacity
                                        style={[styles.modalBtn, { borderWidth: 1, borderColor: colors.border }]}
                                        onPress={() => setModal(null)}
                                    >
                                        <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Annuler</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.modalBtn,
                                            { backgroundColor: modal.destructive ? colors.error : colors.primary },
                                        ]}
                                        onPress={() => {
                                            const action = modal.onConfirm;
                                            setModal(null);
                                            action?.();
                                        }}
                                    >
                                        <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>{modal.confirmText}</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.modalBtn, { flex: 1, backgroundColor: colors.primary }]}
                                    onPress={() => setModal(null)}
                                >
                                    <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>OK</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: SPACING.lg, paddingTop: 60, paddingBottom: 100 },
    title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: SPACING.lg },
    section: {
        backgroundColor: colors.card, borderRadius: BORDER_RADIUS.md,
        padding: SPACING.lg, marginBottom: SPACING.md,
        borderWidth: 1, borderColor: colors.border,
    },
    sectionTitle: {
        color: colors.textSecondary, fontSize: 13, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: SPACING.md,
    },
    avatarContainer: { alignSelf: 'center', marginBottom: SPACING.lg },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    avatarPlaceholder: {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 40, fontWeight: '800', color: colors.text },
    avatarOverlay: { position: 'absolute', top: 35, left: 35 },
    avatarBadge: {
        position: 'absolute', bottom: 0, right: 0,
        backgroundColor: colors.card, borderRadius: 15,
        width: 30, height: 30, justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: colors.border,
    },
    avatarBadgeText: { fontSize: 14 },
    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: SPACING.sm, borderBottomWidth: 1,
        borderBottomColor: colors.border + '40',
    },
    infoLabel: { color: colors.textSecondary, fontSize: 15 },
    infoValue: { color: colors.text, fontSize: 15, fontWeight: '600' },
    weightRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    weightInput: {
        flex: 1, backgroundColor: colors.backgroundLight,
        borderRadius: BORDER_RADIUS.sm, padding: SPACING.md,
        color: colors.text, fontSize: 20, fontWeight: '700',
        borderWidth: 1, borderColor: colors.border,
    },
    weightUnit: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
    weightSave: {
        backgroundColor: colors.primary, width: 48, height: 48,
        borderRadius: BORDER_RADIUS.full, justifyContent: 'center', alignItems: 'center',
    },
    weightSaveText: { fontSize: 20 },
    input: {
        backgroundColor: colors.backgroundLight,
        borderRadius: BORDER_RADIUS.sm, padding: SPACING.md,
        color: colors.text, fontSize: 16, marginBottom: SPACING.md,
        borderWidth: 1, borderColor: colors.border,
    },
    changePasswordButton: {
        backgroundColor: colors.primary, borderRadius: BORDER_RADIUS.sm,
        paddingVertical: SPACING.sm, alignItems: 'center',
    },
    changePasswordText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    logoutButton: {
        backgroundColor: colors.backgroundLight,
        borderRadius: BORDER_RADIUS.sm, padding: SPACING.md,
        alignItems: 'center', marginBottom: SPACING.md,
    },
    logoutText: { color: colors.text, fontSize: 16, fontWeight: '600' },
    resetButton: {
        backgroundColor: '#F59E0B20',
        borderRadius: BORDER_RADIUS.sm, padding: SPACING.md,
        alignItems: 'center', borderWidth: 1, borderColor: '#F59E0B40',
        marginBottom: SPACING.md,
    },
    resetText: { color: '#F59E0B', fontSize: 16, fontWeight: '600' },
    deleteButton: {
        backgroundColor: colors.error + '20',
        borderRadius: BORDER_RADIUS.sm, padding: SPACING.md,
        alignItems: 'center', borderWidth: 1, borderColor: colors.error + '40',
    },
    deleteText: { color: colors.error, fontSize: 16, fontWeight: '600' },
    genderToggle: { flexDirection: 'row', gap: SPACING.xs },
    genderMiniBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.border,
    },
    genderMiniBtnActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    genderMiniText: {
        color: colors.text,
        fontSize: 12,
        fontWeight: '600',
    },
    themeToggle: {
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.border,
        padding: 2,
        justifyContent: 'center',
    },
    themeToggleActive: {
        backgroundColor: colors.primary + '40',
    },
    themeToggleCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: colors.textMuted,
    },
    themeToggleCircleActive: {
        alignSelf: 'flex-end',
        backgroundColor: colors.primary,
    },
    footerBranding: { textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: SPACING.xl, opacity: 0.6 },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: SPACING.lg,
    },
    modalBox: {
        width: '100%',
        maxWidth: 400,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.xl,
        borderWidth: 1,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: SPACING.xs,
    },
    modalMessage: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: SPACING.lg,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: SPACING.sm,
        marginTop: SPACING.sm,
    },
    modalBtn: {
        flex: 1,
        borderRadius: BORDER_RADIUS.sm,
        paddingVertical: SPACING.sm + 2,
        alignItems: 'center',
    },
    modalBtnText: {
        fontSize: 14,
        fontWeight: '700',
    },
});
