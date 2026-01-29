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
  increment, // Added increment for atomic XP updates
} from "firebase/firestore"
import { db, auth } from "../firebaseConfig"

// Badge definitions with conditions AND REWARDS
export const BADGE_DEFINITIONS = [
  // Quest Completion Badges
  {
    id: "first_quest",
    title: "First Steps",
    description: "Complete your first quest",
    icon: "trophy-outline",
    category: "milestone",
    condition: (stats) => stats.totalQuestsCompleted >= 1,
    rarity: "common",
    xpReward: 100, // Reward Added
  },
  {
    id: "quest_warrior",
    title: "Quest Warrior",
    description: "Complete 10 quests",
    icon: "shield-checkmark",
    category: "quest",
    condition: (stats) => stats.totalQuestsCompleted >= 10,
    rarity: "uncommon",
    xpReward: 250, // Reward Added
  },
  {
    id: "quest_master",
    title: "Quest Master",
    description: "Complete 50 quests",
    icon: "medal",
    category: "quest",
    condition: (stats) => stats.totalQuestsCompleted >= 50,
    rarity: "rare",
    xpReward: 1000, // Reward Added
  },

  // Strength Badges
  {
    id: "strength_starter",
    title: "Strength Starter",
    description: "Complete 5 strength quests",
    icon: "barbell-outline",
    category: "strength",
    condition: (stats) => stats.strengthQuestsCompleted >= 5,
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
    rarity: "rare",
    xpReward: 500,
  },

  // Step Badges
  {
    id: "step_counter",
    title: "Step Counter",
    description: "Take 10,000 steps in one day",
    icon: "footsteps",
    category: "fitness",
    condition: (stats) => stats.maxDailySteps >= 10000,
    rarity: "common",
    xpReward: 100,
  },
  {
    id: "marathon_walker",
    title: "Marathon Walker",
    description: "Take 50,000 steps in one day",
    icon: "walk",
    category: "fitness",
    condition: (stats) => stats.maxDailySteps >= 50000,
    rarity: "epic",
    xpReward: 1000,
  },
  {
    id: "step_millionaire",
    title: "Step Millionaire",
    description: "Take 1,000,000 steps total",
    icon: "trending-up",
    category: "milestone",
    condition: (stats) => stats.totalSteps >= 1000000,
    rarity: "legendary",
    xpReward: 5000,
  },

  // Distance Badges
  {
    id: "distance_explorer",
    title: "Distance Explorer",
    description: "Cover 10km in one day",
    icon: "location",
    category: "endurance",
    condition: (stats) => stats.maxDailyDistance >= 10,
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
    totalSteps: activitiesData.reduce((sum, act) => sum + (act.steps || 0), 0),
    totalDistance: activitiesData.reduce((sum, act) => sum + (act.distance || 0) / 1000, 0),
    totalReps: activitiesData.reduce((sum, act) => sum + (act.reps || 0), 0),
    maxDailySteps: Math.max(...activitiesData.map((act) => act.steps || 0), 0),
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

export const getAllBadgesWithStatus = (earnedBadges) => {
  return BADGE_DEFINITIONS.map((def) => {
    // Check if the user has earned this specific badge definition
    const earnedBadge = earnedBadges.find((b) => b.id === def.id);

    if (earnedBadge) {
      // User has it: Use the firestore data (includes date, claimed status, etc.)
      return { ...def, ...earnedBadge, locked: false };
    } else {
      // User does NOT have it: Return definition but mark as locked
      return {
        ...def,
        locked: true,
        earnedAt: null,
        claimed: false,
        // Ensure the description (the "needs") is visible
        description: def.description
      };
    }
  });
};

/**
 * Load badges from Firestore
 */
export const loadBadgesFromFirestore = async (userId) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.warn("[Badge System] No authenticated user");
      return [];
    }

    const userBadgesRef = doc(db, "user_badges", user.uid);
    const userBadgesDoc = await getDoc(userBadgesRef);

    if (userBadgesDoc.exists()) {
      const data = userBadgesDoc.data();
      let badges = data.badges || [];

      // --- DATA MIGRATION LOGIC ---
      let needsUpdate = false;

      const updatedBadges = badges.map((storedBadge) => {
        // 1. Find the code definition for this stored badge
        const definition = BADGE_DEFINITIONS.find(def => def.id === storedBadge.id);

        // 2. If the stored badge is missing xpReward or claimed status, fix it
        if (definition) {
          const missingReward = storedBadge.xpReward === undefined;
          const missingClaimed = storedBadge.claimed === undefined;

          if (missingReward || missingClaimed) {
            needsUpdate = true;
            return {
              ...storedBadge,
              // Backfill the reward from your code definition
              xpReward: definition.xpReward || 0,
              // Default old badges to "unclaimed" so users can enjoy clicking them
              claimed: storedBadge.claimed || false,
            };
          }
        }
        return storedBadge;
      });

      // 3. If we fixed any data, save it back to Firestore immediately
      if (needsUpdate) {
        console.log("⚠️ [Badge System] Detected legacy badge data. Migrating...");
        await updateDoc(userBadgesRef, {
          badges: updatedBadges,
          lastUpdated: serverTimestamp()
        });
        console.log("✅ [Badge System] Legacy data fixed and saved.");
        return updatedBadges;
      }

      console.log(`✅ [Badge System] Loaded ${badges.length} badges from Firestore`);
      return badges;
    }

    console.log("[Badge System] No badges found, returning empty array");
    return [];
  } catch (error) {
    console.error("❌ Error loading badges from Firestore:", error);
    return [];
  }
};

/**
 * Claim Badge Reward
 * Marks badge as claimed and increments user XP atomically
 */
export const claimBadgeReward = async (userId, badgeId) => {
  try {
    const userBadgesRef = doc(db, "user_badges", userId);
    const userDocRef = doc(db, "users", userId);

    const docSnap = await getDoc(userBadgesRef);

    if (!docSnap.exists()) {
      throw new Error("No badges found");
    }

    const data = docSnap.data();
    let badges = data.badges || [];
    let rewardAmount = 0;
    let badgeFound = false;

    // Find and update the specific badge
    const updatedBadges = badges.map(b => {
      if (b.id === badgeId) {
        if (b.claimed) {
          throw new Error("Reward already claimed");
        }
        badgeFound = true;
        rewardAmount = b.xpReward || 0;
        return { ...b, claimed: true }; // Mark as claimed
      }
      return b;
    });

    if (!badgeFound) throw new Error("Badge not found");

    // 1. Update the badges array in Firestore
    await updateDoc(userBadgesRef, {
      badges: updatedBadges
    });

    // 2. Increment User XP atomically
    if (rewardAmount > 0) {
      await updateDoc(userDocRef, {
        totalXP: increment(rewardAmount),
      });
    }

    console.log(`✅ Claimed ${rewardAmount} XP for badge ${badgeId}`);
    return { success: true, rewardAmount, updatedBadges };
  } catch (error) {
    console.error("Error claiming reward:", error);
    throw error;
  }
};

// Complete quest and check for badges (Kept same)
export const completeQuest = async (questId, questData, activityData) => {
  try {
    const user = auth.currentUser
    if (!user) throw new Error("User not authenticated")

    const questCompletionData = {
      questId,
      userId: user.uid,
      completed: true,
      completedAt: new Date(),
      category: questData.category || "unknown",
      type: questData.activityType,
      xpEarned: questData.xpReward,
      goalAchieved: activityData.value >= questData.goal,
      actualValue: activityData.value,
      targetValue: questData.goal,
    }

    await addDoc(collection(db, "quest_completions"), questCompletionData)

    const userRef = doc(db, "users", user.uid)
    const userDoc = await getDoc(userRef)

    if (userDoc.exists()) {
      const currentData = userDoc.data()
      const newXP = (currentData.totalXP || 0) + questData.xpReward
      const newLevel = Math.max(1, Math.floor(newXP / 1000) + 1)

      await updateDoc(userRef, {
        totalXP: newXP,
        level: newLevel,
        lastQuestCompleted: new Date(),
      })
    }

    return questCompletionData
  } catch (error) {
    console.error("Error completing quest:", error)
    throw error
  }
}

export const getUserQuestHistory = async (userId) => {
  try {
    const questCompletionsRef = collection(db, "quest_completions");

    const q = query(
      questCompletionsRef,
      where("userId", "==", userId),
      where("completed", "==", true)
    );

    const querySnapshot = await getDocs(q);

    const questHistory = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return questHistory;
  } catch (error) {
    console.error("Error fetching quest history:", error);
    return [];
  }
};