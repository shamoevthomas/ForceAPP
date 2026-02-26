import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { DARK_COLORS, LIGHT_COLORS } from '../constants/theme';

type ThemeType = 'dark' | 'light';

interface ThemeContextType {
    theme: ThemeType;
    colors: typeof DARK_COLORS;
    isDark: boolean;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'user_theme_preference';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemColorScheme = useColorScheme();
    const [theme, setTheme] = useState<ThemeType>('dark');

    useEffect(() => {
        // Load persisted theme
        SecureStore.getItemAsync(THEME_STORAGE_KEY).then((savedTheme) => {
            if (savedTheme === 'light' || savedTheme === 'dark') {
                setTheme(savedTheme as ThemeType);
            } else {
                // Fallback to system preference
                setTheme(systemColorScheme === 'light' ? 'light' : 'dark');
            }
        });
    }, [systemColorScheme]);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        SecureStore.setItemAsync(THEME_STORAGE_KEY, newTheme);
    };

    const colors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    const isDark = theme === 'dark';

    return (
        <ThemeContext.Provider value={{ theme, colors, isDark, toggleTheme }}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
