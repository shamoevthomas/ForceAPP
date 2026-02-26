import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

export function useIsStandalone() {
    const [isStandalone, setIsStandalone] = useState(true);

    useEffect(() => {
        if (Platform.OS !== 'web') {
            setIsStandalone(true);
            return;
        }

        const checkStandalone = () => {
            // Android / Chrome
            const isChromeStandalone = window.matchMedia('(display-mode: standalone)').matches;

            // iOS / Safari
            const isSafariStandalone = (navigator as any).standalone === true;

            setIsStandalone(isChromeStandalone || isSafariStandalone);
        };

        checkStandalone();

        // Optional: Listen for changes if the user somehow toggles it (rare)
        const mediaQuery = window.matchMedia('(display-mode: standalone)');
        const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches || (navigator as any).standalone === true);

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    return isStandalone;
}
