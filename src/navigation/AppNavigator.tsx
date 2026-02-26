import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { SPACING, BORDER_RADIUS } from '../constants/theme';

// Screens
import AuthScreen from '../screens/AuthScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProgramCreationScreen from '../screens/ProgramCreationScreen';
import HomeScreen from '../screens/HomeScreen';
import ProgramScreen from '../screens/ProgramScreen';
import ProgressionScreen from '../screens/ProgressionScreen';
import ChartsScreen from '../screens/ChartsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
    return (
        <Text style={{ fontSize: focused ? 26 : 22, opacity: focused ? 1 : 0.5 }}>
            {emoji}
        </Text>
    );
}

function MainTabs() {
    const { colors } = useTheme();
    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.backgroundLight,
                    borderTopColor: colors.border,
                    borderTopWidth: 1,
                    height: 80,
                    paddingBottom: 20,
                    paddingTop: 8,
                },
                tabBarActiveTintColor: colors.primary,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                },
            }}
        >
            <Tab.Screen
                name="Home"
                component={HomeScreen}
                options={{
                    tabBarLabel: 'Accueil',
                    tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
                }}
            />
            <Tab.Screen
                name="Program"
                component={ProgramScreen}
                options={{
                    tabBarLabel: 'Programme',
                    tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
                }}
            />
            <Tab.Screen
                name="Progression"
                component={ProgressionScreen}
                options={{
                    tabBarLabel: 'Progression',
                    tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} />,
                }}
            />
            <Tab.Screen
                name="Charts"
                component={ChartsScreen}
                options={{
                    tabBarLabel: 'Graphiques',
                    tabBarIcon: ({ focused }) => <TabIcon emoji="📈" focused={focused} />,
                }}
            />
            <Tab.Screen
                name="Settings"
                component={SettingsScreen}
                options={{
                    tabBarLabel: 'Paramètres',
                    tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
                }}
            />
        </Tab.Navigator>
    );
}

function OnboardingStack() {
    const { refreshProfile } = useAuth();
    const { colors } = useTheme();
    const styles = createStyles(colors);
    const [hasProgram, setHasProgram] = React.useState(false);
    const [checkingProgram, setCheckingProgram] = React.useState(true);
    const { user, needsOnboarding } = useAuth();

    React.useEffect(() => {
        checkProgram();
    }, [needsOnboarding]);

    const checkProgram = async () => {
        if (!user || needsOnboarding) {
            setCheckingProgram(false);
            return;
        }
        const { supabase } = require('../lib/supabase');
        const { data } = await supabase
            .from('programs')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1);

        setHasProgram(data && data.length > 0);
        setCheckingProgram(false);
    };

    if (checkingProgram) {
        return (
            <View style={styles.loading}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (needsOnboarding) {
        return <OnboardingScreen />;
    }

    if (!hasProgram) {
        return (
            <ProgramCreationScreen
                onComplete={() => {
                    setHasProgram(true);
                }}
            />
        );
    }

    return <MainTabs />;
}

export default function AppNavigator() {
    const { session, loading } = useAuth();
    const { colors } = useTheme();
    const styles = createStyles(colors);

    if (loading) {
        return (
            <View style={styles.loading}>
                <Text style={styles.loadingLogo}>⚡</Text>
                <Text style={styles.loadingTitle}>FORCE</Text>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
            </View>
        );
    }

    return (
        <NavigationContainer>
            {session ? <OnboardingStack /> : <AuthScreen />}
        </NavigationContainer>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    loading: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingLogo: { fontSize: 64 },
    loadingTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: colors.text,
        letterSpacing: 6,
        marginTop: 12,
    },
});
