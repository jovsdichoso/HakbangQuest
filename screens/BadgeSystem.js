// screens/BadgeSystem.js - Badge logic and management
import { doc, updateDoc, getDoc, addDoc, collection, query, where, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

// Badge definitions with conditions
export const BADGE_DEFINITIONS = [
    // Quest Completion Badges
    {
        id: 'first_quest',
        title: 'First Steps',
        description: 'Complete your first quest',
        icon: 'trophy-outline',
        category: 'milestone',
        condition: (stats) => stats.totalQuestsCompleted >= 1,
        rarity: 'common'
    },
    {
        id: 'quest_warrior',
        title: 'Quest Warrior',
        description: 'Complete 10 quests',
        icon: 'shield-checkmark',
        category: 'quest',
        condition: (stats) => stats.totalQuestsCompleted >= 10,
        rarity: 'uncommon'
    },
    {
        id: 'quest_master',
        title: 'Quest Master',
        description: 'Complete 50 quests',
        icon: 'medal',
        category: 'quest',
        condition: (stats) => stats.totalQuestsCompleted >= 50,
        rarity: 'rare'
    },

    // Strength Badges
    {
        id: 'strength_starter',
        title: 'Strength Starter',
        description: 'Complete 5 strength quests',
        icon: 'barbell-outline',
        category: 'strength',
        condition: (stats) => stats.strengthQuestsCompleted >= 5,
        rarity: 'common'
    },
    {
        id: 'iron_pumper',
        title: 'Iron Pumper',
        description: 'Complete 25 strength quests',
        icon: 'barbell',
        category: 'strength',
        condition: (stats) => stats.strengthQuestsCompleted >= 25,
        rarity: 'uncommon'
    },
    {
        id: 'rep_master',
        title: 'Rep Master',
        description: 'Complete 1000 reps in total',
        icon: 'fitness',
        category: 'strength',
        condition: (stats) => stats.totalReps >= 1000,
        rarity: 'rare'
    },

    // Step Badges
    {
        id: 'step_counter',
        title: 'Step Counter',
        description: 'Take 10,000 steps in one day',
        icon: 'footsteps',
        category: 'fitness',
        condition: (stats) => stats.maxDailySteps >= 10000,
        rarity: 'common'
    },
    {
        id: 'marathon_walker',
        title: 'Marathon Walker',
        description: 'Take 50,000 steps in one day',
        icon: 'walk',
        category: 'fitness',
        condition: (stats) => stats.maxDailySteps >= 50000,
        rarity: 'epic'
    },
    {
        id: 'step_millionaire',
        title: 'Step Millionaire',
        description: 'Take 1,000,000 steps total',
        icon: 'trending-up',
        category: 'milestone',
        condition: (stats) => stats.totalSteps >= 1000000,
        rarity: 'legendary'
    },

    // Distance Badges
    {
        id: 'distance_explorer',
        title: 'Distance Explorer',
        description: 'Cover 10km in one day',
        icon: 'location',
        category: 'endurance',
        condition: (stats) => stats.maxDailyDistance >= 10,
        rarity: 'common'
    },
    {
        id: 'ultra_runner',
        title: 'Ultra Runner',
        description: 'Cover 50km in one day',
        icon: 'speedometer',
        category: 'endurance',
        condition: (stats) => stats.maxDailyDistance >= 50,
        rarity: 'epic'
    },

    // Consistency Badges
    {
        id: 'consistent_performer',
        title: 'Consistent Performer',
        description: 'Complete quests 7 days in a row',
        icon: 'calendar',
        category: 'consistency',
        condition: (stats) => stats.longestStreak >= 7,
        rarity: 'uncommon'
    },
    {
        id: 'dedication_master',
        title: 'Dedication Master',
        description: 'Complete quests 30 days in a row',
        icon: 'flame',
        category: 'consistency',
        condition: (stats) => stats.longestStreak >= 30,
        rarity: 'epic'
    },

    // Level Badges
    {
        id: 'level_up',
        title: 'Level Up!',
        description: 'Reach level 5',
        icon: 'arrow-up-circle',
        category: 'milestone',
        condition: (stats) => stats.level >= 5,
        rarity: 'common'
    },
    {
        id: 'elite_athlete',
        title: 'Elite Athlete',
        description: 'Reach level 20',
        icon: 'star',
        category: 'milestone',
        condition: (stats) => stats.level >= 20,
        rarity: 'rare'
    },
    {
        id: 'fitness_legend',
        title: 'Fitness Legend',
        description: 'Reach level 50',
        icon: 'diamond',
        category: 'milestone',
        condition: (stats) => stats.level >= 50,
        rarity: 'legendary'
    }
];

// Badge rarity colors
export const BADGE_COLORS = {
    common: '#9CA3AF',
    uncommon: '#06D6A0',
    rare: '#4361EE',
    epic: '#9333EA',
    legendary: '#F59E0B'
};

// Calculate user stats for badge evaluation
export const calculateBadgeStats = (activitiesData, questHistory = []) => {
    const stats = {
        // Quest stats
        totalQuestsCompleted: questHistory.filter(q => q.completed).length,
        strengthQuestsCompleted: questHistory.filter(q => q.completed && q.category === 'strength').length,
        enduranceQuestsCompleted: questHistory.filter(q => q.completed && q.category === 'endurance').length,
        fitnessQuestsCompleted: questHistory.filter(q => q.completed && q.category === 'fitness').length,

        // Activity stats
        totalSteps: activitiesData.reduce((sum, act) => sum + (act.steps || 0), 0),
        totalDistance: activitiesData.reduce((sum, act) => sum + (act.distance || 0), 0),
        totalReps: activitiesData.reduce((sum, act) => sum + (act.reps || 0), 0),

        // Daily maximums
        maxDailySteps: Math.max(...activitiesData.map(act => act.steps || 0), 0),
        maxDailyDistance: Math.max(...activitiesData.map(act => act.distance || 0), 0),
        maxDailyReps: Math.max(...activitiesData.map(act => act.reps || 0), 0),

        // Streak calculation
        longestStreak: calculateLongestStreak(questHistory),

        // Level from existing system
        level: Math.max(1, Math.floor(activitiesData.length / 10) + 1)
    };

    return stats;
};

// Calculate longest streak of completed quests
const calculateLongestStreak = (questHistory) => {
    if (questHistory.length === 0) return 0;

    // Group by date and check if any quest was completed each day
    const dailyCompletions = {};
    questHistory.forEach(quest => {
        if (quest.completed && quest.completedAt) {
            const date = quest.completedAt.toDate ?
                quest.completedAt.toDate().toDateString() :
                new Date(quest.completedAt).toDateString();
            dailyCompletions[date] = true;
        }
    });

    const dates = Object.keys(dailyCompletions).sort();
    let currentStreak = 0;
    let maxStreak = 0;

    for (let i = 0; i < dates.length; i++) {
        if (i === 0) {
            currentStreak = 1;
        } else {
            const prevDate = new Date(dates[i - 1]);
            const currentDate = new Date(dates[i]);
            const dayDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

            if (dayDiff === 1) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }
        }
        maxStreak = Math.max(maxStreak, currentStreak);
    }

    return maxStreak;
};

// Evaluate which badges should be awarded
export const evaluateBadges = (userStats, currentBadges = []) => {
    const earnedBadgeIds = currentBadges.map(badge => badge.id);
    const newBadges = [];

    BADGE_DEFINITIONS.forEach(badgeDefinition => {
        // Skip if already earned
        if (earnedBadgeIds.includes(badgeDefinition.id)) return;

        // Check if condition is met
        if (badgeDefinition.condition(userStats)) {
            newBadges.push({
                ...badgeDefinition,
                earnedAt: new Date(),
                isNew: true
            });
        }
    });

    return newBadges;
};

// Save badges to Firestore
export const saveBadgesToFirestore = async (badges) => {
    try {
        const user = auth.currentUser
        if (!user) {
            throw new Error("User not authenticated")
        }

        // Clean badges data - remove any functions and ensure serializable data
        const cleanBadges = badges.map((badge) => ({
            id: badge.id,
            title: badge.title, // Changed from 'name' to 'title'
            description: badge.description,
            icon: badge.icon,
            rarity: badge.rarity,
            category: badge.category,
            earnedAt: badge.earnedAt || new Date(),
            // Only include defined properties
        }))

        const userBadgesRef = doc(db, "user_badges", user.uid)
        await setDoc(
            userBadgesRef,
            {
                userId: user.uid,
                badges: cleanBadges,
                lastUpdated: serverTimestamp(),
            },
            { merge: true },
        )
        console.log("Badges saved successfully to Firestore")
    } catch (error) {
        console.error("Error saving badges to Firestore:", error)
        throw error
    }
}

// Load badges from Firestore
export const loadBadgesFromFirestore = async () => {
    try {
        const user = auth.currentUser
        if (!user) {
            return []
        }

        const userBadgesRef = doc(db, "user_badges", user.uid)
        const userBadgesDoc = await getDoc(userBadgesRef)

        if (userBadgesDoc.exists()) {
            const data = userBadgesDoc.data()
            return data.badges || []
        }

        return []
    } catch (error) {
        console.error("Error loading badges from Firestore:", error)
        return []
    }
}

// Complete quest and check for badges
export const completeQuest = async (questId, questData, activityData) => {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        // Save quest completion to Firestore
        const questCompletionData = {
            questId,
            userId: user.uid,
            completed: true,
            completedAt: new Date(),
            category: questData.category,
            type: questData.activityType,
            xpEarned: questData.xpReward,
            goalAchieved: activityData.value >= questData.goal,
            actualValue: activityData.value,
            targetValue: questData.goal
        };

        // Add to quest_completions collection
        await addDoc(collection(db, 'quest_completions'), questCompletionData);

        // Update user's total XP and level
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            const currentData = userDoc.data();
            const newXP = (currentData.totalXP || 0) + questData.xpReward;
            const newLevel = Math.max(1, Math.floor(newXP / 1000) + 1);

            await updateDoc(userRef, {
                totalXP: newXP,
                level: newLevel,
                lastQuestCompleted: new Date()
            });
        }

        return questCompletionData;
    } catch (error) {
        console.error('Error completing quest:', error);
        throw error;
    }
};

// Get user's quest history for badge calculations
export const getUserQuestHistory = async (userId) => {
    try {
        const questCompletionsRef = collection(db, 'quest_completions');
        const q = query(
            questCompletionsRef,
            where('userId', '==', userId),
            where('completed', '==', true)
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error fetching quest history:', error);
        return [];
    }
};