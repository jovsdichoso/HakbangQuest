// screens/BadgeSystem.js - Badge logic and management
import {
  doc,
  updateDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore"
import { db, auth } from "../firebaseConfig"

// Badge definitions with TRACKING METADATA
// ✅ REMOVED: All "Step" based badges since we don't track steps.
export const BADGE_DEFINITIONS = [
  // Quest Completion Badges
  {
    id: "first_quest",
    title: "First Steps",
    description: "Complete your first quest",
    icon: "trophy-outline",
    category: "milestone",
    condition: (stats) => stats.totalQuestsCompleted >= 1,
    progressTarget: 1,
    progressKey: "totalQuestsCompleted",
    unit: "Quest",
    rarity: "common",
    xpReward: 100,
  },
  {
    id: "quest_warrior",
    title: "Quest Warrior",
    description: "Complete 10 quests",
    icon: "shield-checkmark",
    category: "quest",
    condition: (stats) => stats.totalQuestsCompleted >= 10,
    progressTarget: 10,
    progressKey: "totalQuestsCompleted",
    unit: "Quests",
    rarity: "uncommon",
    xpReward: 250,
  },
  {
    id: "quest_master",
    title: "Quest Master",
    description: "Complete 50 quests",
    icon: "medal",
    category: "quest",
    condition: (stats) => stats.totalQuestsCompleted >= 50,
    progressTarget: 50,
    progressKey: "totalQuestsCompleted",
    unit: "Quests",
    rarity: "rare",
    xpReward: 1000,
  },

  // Strength Badges
  {
    id: "strength_starter",
    title: "Strength Starter",
    description: "Complete 5 strength quests",
    icon: "barbell-outline",
    category: "strength",
    condition: (stats) => stats.strengthQuestsCompleted >= 5,
    progressTarget: 5,
    progressKey: "strengthQuestsCompleted",
    unit: "Quests",
    rarity: "common",
    xpReward: 100,
  },
  {
    id: "iron_pumper",
    title: "Iron Pumper",
    description: "Complete 25 strength quests",
    icon: "barbell",
    category: "strength",
    condition: (stats) => stats.strengthQuestsCompleted >= 25,
    progressTarget: 25,
    progressKey: "strengthQuestsCompleted",
    unit: "Quests",
    rarity: "uncommon",
    xpReward: 250,
  },
  {
    id: "rep_master",
    title: "Rep Master",
    description: "Complete 1000 reps in total",
    icon: "fitness",
    category: "strength",
    condition: (stats) => stats.totalReps >= 1000,
    progressTarget: 1000,
    progressKey: "totalReps",
    unit: "Reps",
    rarity: "rare",
    xpReward: 500,
  },

  // Distance Badges
  {
    id: "distance_explorer",
    title: "Distance Explorer",
    description: "Cover 10km in one day",
    icon: "location",
    category: "endurance",
    condition: (stats) => stats.maxDailyDistance >= 10,
    progressTarget: 10,
    progressKey: "maxDailyDistance",
    unit: "km",
    rarity: "common",
    xpReward: 100,
  },
  {
    id: "ultra_runner",
    title: "Ultra Runner",
    description: "Cover 50km in one day",
    icon: "speedometer",
    category: "endurance",
    condition: (stats) => stats.maxDailyDistance >= 50,
    progressTarget: 50,
    progressKey: "maxDailyDistance",
    unit: "km",
    rarity: "epic",
    xpReward: 1000,
  },

  // Consistency Badges
  {
    id: "consistent_performer",
    title: "Consistent Performer",
    description: "Complete quests 7 days in a row",
    icon: "calendar",
    category: "consistency",
    condition: (stats) => stats.longestStreak >= 7,
    progressTarget: 7,
    progressKey: "longestStreak",
    unit: "Days",
    rarity: "uncommon",
    xpReward: 300,
  },
  {
    id: "dedication_master",
    title: "Dedication Master",
    description: "Complete quests 30 days in a row",
    icon: "flame",
    category: "consistency",
    condition: (stats) => stats.longestStreak >= 30,
    progressTarget: 30,
    progressKey: "longestStreak",
    unit: "Days",
    rarity: "epic",
    xpReward: 1500,
  },

  // Level Badges
  {
    id: "level_up",
    title: "Level Up!",
    description: "Reach level 5",
    icon: "arrow-up-circle",
    category: "milestone",
    condition: (stats) => stats.level >= 5,
    progressTarget: 5,
    progressKey: "level",
    unit: "Lvl",
    rarity: "common",
    xpReward: 100,
  },
  {
    id: "elite_athlete",
    title: "Elite Athlete",
    description: "Reach level 20",
    icon: "star",
    category: "milestone",
    condition: (stats) => stats.level >= 20,
    progressTarget: 20,
    progressKey: "level",
    unit: "Lvl",
    rarity: "rare",
    xpReward: 500,
  },
  {
    id: "fitness_legend",
    title: "Fitness Legend",
    description: "Reach level 50",
    icon: "diamond",
    category: "milestone",
    condition: (stats) => stats.level >= 50,
    progressTarget: 50,
    progressKey: "level",
    unit: "Lvl",
    rarity: "legendary",
    xpReward: 5000,
  },
]

// Badge rarity colors
export const BADGE_COLORS = {
  common: "#9CA3AF",
  uncommon: "#06D6A0",
  rare: "#4361EE",
  epic: "#9333EA",
  legendary: "#F59E0B",
}

// Calculate user stats for badge evaluation
export const calculateBadgeStats = (activitiesData, questHistory = []) => {
  const stats = {
    totalQuestsCompleted: questHistory.length,
    strengthQuestsCompleted: questHistory.filter((q) => q.category === "strength").length,
    enduranceQuestsCompleted: questHistory.filter((q) => q.category === "endurance").length,
    fitnessQuestsCompleted: questHistory.filter((q) => q.category === "fitness").length,
    totalDistance: activitiesData.reduce((sum, act) => sum + (act.distance || 0) / 1000, 0),
    totalReps: activitiesData.reduce((sum, act) => sum + (act.reps || 0), 0),
    maxDailyDistance: Math.max(...activitiesData.map((act) => (act.distance || 0) / 1000), 0),
    maxDailyReps: Math.max(...activitiesData.map((act) => act.reps || 0), 0),
    longestStreak: calculateLongestStreak(questHistory),
    level: Math.max(1, Math.floor(activitiesData.length / 10) + 1),
  }
  return stats
}

// Calculate longest streak of completed quests
const calculateLongestStreak = (questHistory) => {
  if (questHistory.length === 0) return 0

  const dailyCompletions = {}
  questHistory.forEach((quest) => {
    if (quest.completedAt) {
      const date = quest.completedAt.toDate
        ? quest.completedAt.toDate().toDateString()
        : new Date(quest.completedAt).toDateString()
      dailyCompletions[date] = true
    }
  })

  const dates = Object.keys(dailyCompletions).map(d => new Date(d)).sort((a, b) => a - b)
  let currentStreak = 0
  let maxStreak = 0

  for (let i = 0; i < dates.length; i++) {
    if (i === 0) {
      currentStreak = 1
    } else {
      const prevDate = dates[i - 1]
      const currentDate = dates[i]
      const prevDateString = prevDate.toDateString()
      const currentDateString = currentDate.toDateString()

      if (prevDateString !== currentDateString) {
        const dayDiff = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
        if (dayDiff === 1) {
          currentStreak++
        } else {
          currentStreak = 1
        }
      }
    }
    maxStreak = Math.max(maxStreak, currentStreak)
  }
  return maxStreak
}

// Evaluate which badges should be awarded
export const evaluateBadges = (userStats, currentBadges = []) => {
  const earnedBadgeIds = currentBadges.map((badge) => badge.id)
  const newBadges = []

  BADGE_DEFINITIONS.forEach((badgeDefinition) => {
    if (earnedBadgeIds.includes(badgeDefinition.id)) return

    if (badgeDefinition.condition(userStats)) {
      newBadges.push({
        ...badgeDefinition,
        earnedAt: new Date(),
        isNew: true,
        claimed: false, // Default to unclaimed
      })
    }
  })

  return newBadges
}

export const saveBadgesToFirestore = async (userId, badges) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("User not authenticated");
    }

    if (!badges || !Array.isArray(badges)) {
      console.error("[Badge System] Invalid badges data:", badges);
      throw new Error("Badges must be an array");
    }

    const cleanBadges = badges.map((badge) => ({
      id: badge.id,
      title: badge.title,
      description: badge.description,
      icon: badge.icon,
      rarity: badge.rarity,
      category: badge.category,
      earnedAt: badge.earnedAt || new Date(),
      xpReward: badge.xpReward || 0, // Save reward info
      claimed: badge.claimed || false, // Save claim status
    }));

    const userBadgesRef = doc(db, "user_badges", user.uid);

    await setDoc(
      userBadgesRef,
      {
        userId: user.uid,
        badges: cleanBadges,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ Badges saved successfully to Firestore (${cleanBadges.length} badges)`);
  } catch (error) {
    console.error("❌ Error saving badges to Firestore:", error);
    throw error;
  }
};

// ==========================================================
// ✅ UPDATED: MERGE STATS SO WE CAN SHOW PROGRESS (4/10)
// ==========================================================
export const getAllBadgesWithStatus = (earnedBadges, userStats = {}) => {
  return BADGE_DEFINITIONS.map((def) => {
    const earnedBadge = earnedBadges.find((b) => b.id === def.id);

    // Calculate Progress
    const currentValue = userStats[def.progressKey] || 0;
    const targetValue = def.progressTarget || 1;
    const progress = Math.min(currentValue / targetValue, 1);

    if (earnedBadge) {
      return {
        ...def,
        ...earnedBadge,
        locked: false,
        currentValue, // Pass these through
        targetValue,
        progress: 1
      };
    } else {
      return {
        ...def,
        locked: true,
        earnedAt: null,
        claimed: false,
        currentValue, // Pass these through
        targetValue,
        progress
      };
    }
  });
};

export const loadBadgesFromFirestore = async (userId) => {
  try {
    const user = auth.currentUser;
    if (!user) return [];

    const userBadgesRef = doc(db, "user_badges", user.uid);
    const userBadgesDoc = await getDoc(userBadgesRef);

    if (userBadgesDoc.exists()) {
      const data = userBadgesDoc.data();
      let badges = data.badges || [];

      // --- DATA MIGRATION LOGIC ---
      let needsUpdate = false;
      const updatedBadges = badges.map((storedBadge) => {
        const definition = BADGE_DEFINITIONS.find(def => def.id === storedBadge.id);
        if (definition) {
          const missingReward = storedBadge.xpReward === undefined;
          const missingClaimed = storedBadge.claimed === undefined;
          if (missingReward || missingClaimed) {
            needsUpdate = true;
            return {
              ...storedBadge,
              xpReward: definition.xpReward || 0,
              claimed: storedBadge.claimed || false,
            };
          }
        }
        return storedBadge;
      });

      if (needsUpdate) {
        console.log("⚠️ [Badge System] Migrating legacy badge data...");
        await updateDoc(userBadgesRef, {
          badges: updatedBadges,
          lastUpdated: serverTimestamp()
        });
      }

      return badges;
    }
    return [];
  } catch (error) {
    console.error("❌ Error loading badges:", error);
    return [];
  }
};

export const claimBadgeReward = async (userId, badgeId) => {
  try {
    const userBadgesRef = doc(db, "user_badges", userId);
    const userDocRef = doc(db, "users", userId);

    const docSnap = await getDoc(userBadgesRef);
    if (!docSnap.exists()) throw new Error("No badges found");

    const data = docSnap.data();
    let badges = data.badges || [];
    let rewardAmount = 0;
    let badgeFound = false;

    const updatedBadges = badges.map(b => {
      if (b.id === badgeId) {
        if (b.claimed) throw new Error("Reward already claimed");
        badgeFound = true;
        rewardAmount = b.xpReward || 0;
        return { ...b, claimed: true };
      }
      return b;
    });

    if (!badgeFound) throw new Error("Badge not found");

    await updateDoc(userBadgesRef, { badges: updatedBadges });

    if (rewardAmount > 0) {
      await updateDoc(userDocRef, {
        totalXP: increment(rewardAmount),
      });
    }

    return { success: true, rewardAmount, updatedBadges };
  } catch (error) {
    console.error("Error claiming reward:", error);
    throw error;
  }
};

// ===============================================================
// ✅ FIX: FETCH HISTORY FROM BOTH COLLECTIONS
// ===============================================================
export const getUserQuestHistory = async (userId) => {
  try {
    // 1. Fetch legacy/active completions
    const completionsRef = collection(db, "quest_completions");
    // 2. Fetch new passive history
    const historyRef = collection(db, "quest_history");

    const [completionsSnap, historySnap] = await Promise.all([
      getDocs(query(completionsRef, where("userId", "==", userId))),
      getDocs(query(historyRef, where("userId", "==", userId)))
    ]);

    const completions = completionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const history = historySnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Merge them so Badge stats count ALL quests ever done
    return [...completions, ...history];
  } catch (error) {
    console.error("Error fetching quest history:", error);
    return [];
  }
};