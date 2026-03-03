import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { UserProfile, ProgramDayWithExercises } from '../types';

// Configure notification behavior
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotificationsAsync() {
    let token;
    if (Platform.OS === 'web') {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
            await Notifications.requestPermissionsAsync();
        }
        return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        return;
    }

    return token;
}

export async function scheduleDailyReminders(user: any, profile: UserProfile | null) {
    if (!user || Platform.OS === 'web') return; // Scheduling not available on Web/PWA without complex service worker

    // 1. Cancel existing notifications to avoid duplicates
    await Notifications.cancelAllScheduledNotificationsAsync();

    const todayDateStr = new Date().toISOString().split('T')[0];
    const dayOfWeek = (new Date().getDay() || 7);
    const firstName = profile?.username?.split(' ')[0] || 'Forceur';

    // 2. Fetch today's workout to get the title
    const { data: program } = await supabase
        .from('programs')
        .select(`
            id,
            program_days (
                id, day_number, day_label
            )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

    const matchedDay = (program?.program_days as any[])?.find(d => d.day_number === dayOfWeek);
    const workoutTitle = (matchedDay?.day_label || 'ta séance').toLowerCase();

    // 3. Check if today's workout is already logged
    const { data: log } = await supabase
        .from('workout_logs')
        .select('id, completed, is_skipped')
        .eq('user_id', user.id)
        .eq('workout_date', todayDateStr)
        .maybeSingle();

    const alreadyDone = log?.completed || log?.is_skipped;

    // 4. Schedule based on time
    // Morning: 7h00
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `Salut ${firstName} ! 🔥`,
            body: `C'est jour de ${workoutTitle} aujourd'hui. On donne tout !`,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            vibrate: [0, 250, 250, 250],
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour: 7,
            minute: 0,
            repeats: true,
        },
    });

    if (!alreadyDone) {
        // Reminder 16h00
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `Rappel séance 🏋️‍♂️`,
                body: `N'oublie pas d'aller faire ${workoutTitle} ! La progression n'attend pas.`,
                priority: Notifications.AndroidNotificationPriority.HIGH,
                vibrate: [0, 250, 250, 250],
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour: 16,
                minute: 0,
                repeats: true,
            },
        });

        // Check 22h00
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `C'est fini pour aujourd'hui ? 💤`,
                body: `Rassure-moi ${firstName}, tu as bien fait ${workoutTitle} ?`,
                priority: Notifications.AndroidNotificationPriority.HIGH,
                vibrate: [0, 250, 250, 250],
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour: 22,
                minute: 0,
                repeats: true,
            },
        });
    }
}

export async function sendTestNotification() {
    if (Platform.OS === 'web') {
        const title = "Test de notification Force 🔔";
        const body = "Super ! Si tu vois ça, c'est que les notifications locales fonctionnent sur ton navigateur. Note: Sur iPhone, l'app DOIT être ajoutée à l'écran d'accueil.";

        // Check for browser support
        if (!('Notification' in window)) {
            alert(title + "\n\n" + body + "\n\n(Ton navigateur ne supporte pas les notifications natives, voici une alerte de secours)");
            return;
        }

        if (Notification.permission === 'granted') {
            new Notification(title, { body });
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                new Notification(title, { body });
            } else {
                alert("Permission refusée. Active les notifications pour ce site.");
            }
        } else {
            alert("Les notifications sont bloquées dans tes réglages navigateur.");
        }
        return;
    }

    const { status } = await Notifications.getPermissionsAsync();

    if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus !== 'granted') {
            throw new Error("Permissions refusées. Si tu es sur iPhone (PWA), assure-toi d'avoir ajouté l'app à ton écran d'accueil, sinon les notifications ne sont pas autorisées par Apple.");
        }
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title: "Test de notification Force 🔔",
            body: "Super ! Si tu vois ça, c'est que les notifications fonctionnent. Note: Sur iPhone, l'app DOIT être ajoutée à l'écran d'accueil.",
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            vibrate: [0, 250, 250, 250],
        },
        trigger: null,
    });
}
