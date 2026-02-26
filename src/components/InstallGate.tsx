import React from 'react';
import { View, Text, StyleSheet, Dimensions, Image, Platform } from 'react-native';
import { useIsStandalone } from '../hooks/useIsStandalone';
import { LinearGradient } from 'expo-linear-gradient';
import { SPACING, BORDER_RADIUS } from '../constants/theme';

interface InstallGateProps {
    children: React.ReactNode;
}

export default function InstallGate({ children }: InstallGateProps) {
    const isStandalone = useIsStandalone();

    // If we're on native or already in standalone mode, show the app
    if (isStandalone || Platform.OS !== 'web') {
        return <>{children}</>;
    }

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#000000', '#0A0A1A', '#000000']}
                style={styles.background}
            >
                <View style={styles.content}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../../assets/logo.png')}
                            style={styles.logo}
                        />
                        <Text style={styles.title}>FORCE</Text>
                    </View>

                    <Text style={styles.message}>
                        Pour une expérience optimale et sécurisée, veuillez installer l'application sur votre écran d'accueil.
                    </Text>

                    <View style={styles.instructionsContainer}>
                        {/* iOS Instructions */}
                        <View style={styles.instructionCard}>
                            <Text style={styles.osTitle}>🍏 iPhone (Safari)</Text>
                            <Text style={styles.step}>
                                1. Cliquez sur le bouton <Text style={styles.bold}>Partager</Text> (en bas).
                            </Text>
                            <Text style={styles.step}>
                                2. Choisissez <Text style={styles.bold}>"Sur l'écran d'accueil"</Text>.
                            </Text>
                        </View>

                        {/* Android Instructions */}
                        <View style={styles.instructionCard}>
                            <Text style={styles.osTitle}>🤖 Android (Chrome)</Text>
                            <Text style={styles.step}>
                                1. Cliquez sur le <Text style={styles.bold}>Menu (⋮)</Text> en haut à droite.
                            </Text>
                            <Text style={styles.step}>
                                2. Choisissez <Text style={styles.bold}>"Installer l'application"</Text> ou "Ajouter à l'écran d'accueil".
                            </Text>
                        </View>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Une fois installée, lancez FORCE depuis votre écran d'accueil.</Text>
                    </View>
                </View>
            </LinearGradient>
        </View>
    );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    background: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        width: Math.min(width * 0.9, 450),
        alignItems: 'center',
        padding: SPACING.xl,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: SPACING.xxl,
    },
    logo: {
        width: 100,
        height: 100,
        marginBottom: SPACING.sm,
        resizeMode: 'contain',
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: '#FFFFFF',
        letterSpacing: 6,
    },
    message: {
        fontSize: 16,
        color: '#CCCCCC',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: SPACING.xxl,
    },
    instructionsContainer: {
        width: '100%',
        gap: SPACING.lg,
    },
    instructionCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BORDER_RADIUS.md,
        padding: SPACING.lg,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    osTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: SPACING.md,
    },
    step: {
        fontSize: 14,
        color: '#BBBBBB',
        lineHeight: 20,
        marginBottom: SPACING.xs,
    },
    bold: {
        color: '#FFFFFF',
        fontWeight: '800',
    },
    footer: {
        marginTop: SPACING.xxl,
    },
    footerText: {
        fontSize: 12,
        color: '#666666',
        textAlign: 'center',
    },
});
