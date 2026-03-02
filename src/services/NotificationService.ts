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
    if (!user) return;

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
    // Morning (7:00 AM) - Always schedule for the next 7 AM if not already past today's 7 AM
    // (Actually, better to schedule repeating daily and let it happen)

    // Morning: 7h00 - Salut [X], aujourd'hui c'est [seance] !
    await Notifications.scheduleNotificationAsync({
        content: {
            title: `Salut ${firstName} ! 🔥`,
            body: `C'est jour de ${workoutTitle} aujourd'hui. On donne tout !`,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
            hour: 7,
            minute: 0,
            repeats: true,
        },
    });

    // Reminders only if not already done today
    if (!alreadyDone) {
        // Reminder 16h00: Rappel tu dois aller faire [seance]
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `Rappel séance 🏋️‍♂️`,
                body: `N'oublie pas d'aller faire ${workoutTitle} ! La progression n'attend pas.`,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                hour: 16,
                minute: 0,
                repeats: true,
            },
        });

        // Check 22h00: rassure moi [prénom], tu as fait [titre séance] ?
        await Notifications.scheduleNotificationAsync({
            content: {
                title: `C'est fini pour aujourd'hui ? 💤`,
                body: `Rassure-moi ${firstName}, tu as bien fait ${workoutTitle} ?`,
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
