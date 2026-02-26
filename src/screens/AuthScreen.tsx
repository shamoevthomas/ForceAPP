import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, BORDER_RADIUS } from '../constants/theme';

export default function AuthScreen() {
    const { colors, isDark } = useTheme();
    const styles = createStyles(colors);
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn, signUp } = useAuth();

    const handleSubmit = async () => {
        if (!email || !password) {
            Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
            return;
        }
        setLoading(true);
        const { error } = isLogin
            ? await signIn(email, password)
            : await signUp(email, password);

        setLoading(false);
        if (error) {
            Alert.alert('Erreur', error.message);
        } else if (!isLogin) {
            Alert.alert('Succès', 'Vérifiez votre email pour confirmer votre inscription.');
        }
    };

    return (
        <LinearGradient colors={[colors.background, isDark ? '#0D0D2B' : colors.cardLight, colors.backgroundLight]} style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.inner}
            >
                <View style={styles.logoContainer}>
                    <Image source={require('../../assets/logo.png')} style={styles.logoImage} />
                    <Text style={styles.title}>FORCE</Text>
                    <Text style={styles.subtitle}>Surcharge progressive automatisée</Text>
                </View>

                <View style={styles.formContainer}>
                    <View style={styles.tabContainer}>
                        <TouchableOpacity
                            style={[styles.tab, isLogin && styles.tabActive]}
                            onPress={() => setIsLogin(true)}
                        >
                            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Connexion</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, !isLogin && styles.tabActive]}
                            onPress={() => setIsLogin(false)}
                        >
                            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Inscription</Text>
                        </TouchableOpacity>
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor={colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Mot de passe"
                        placeholderTextColor={colors.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleSubmit}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={[colors.primary, colors.primaryDark]}
                            style={styles.buttonGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.buttonText}>
                                    {isLogin ? 'Se connecter' : "S'inscrire"}
                                </Text>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    container: { flex: 1 },
    inner: { flex: 1, justifyContent: 'center', padding: SPACING.lg },
    logoContainer: { alignItems: 'center', marginBottom: SPACING.xxl },
    logoImage: { width: 100, height: 100, marginBottom: SPACING.sm, resizeMode: 'contain' },
    title: {
        fontSize: 42, fontWeight: '900', color: colors.text,
        letterSpacing: 8,
    },
    subtitle: {
        fontSize: 14, color: colors.textSecondary, marginTop: SPACING.xs,
        letterSpacing: 1,
    },
    formContainer: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.lg,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tabContainer: {
        flexDirection: 'row',
        marginBottom: SPACING.lg,
        backgroundColor: colors.backgroundLight,
        borderRadius: BORDER_RADIUS.sm,
        padding: 4,
    },
    tab: {
        flex: 1, paddingVertical: SPACING.sm,
        alignItems: 'center', borderRadius: BORDER_RADIUS.sm - 2,
    },
    tabActive: { backgroundColor: colors.primary },
    tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    tabTextActive: { color: '#FFFFFF' },
    input: {
        backgroundColor: colors.backgroundLight,
        borderRadius: BORDER_RADIUS.sm,
        padding: SPACING.md,
        color: colors.text,
        fontSize: 16,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    button: { marginTop: SPACING.sm, borderRadius: BORDER_RADIUS.sm, overflow: 'hidden' },
    buttonGradient: {
        paddingVertical: SPACING.md,
        alignItems: 'center',
        borderRadius: BORDER_RADIUS.sm,
    },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
