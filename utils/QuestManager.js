// utils/QuestManager.js
import {
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    serverTimestamp,
    increment,
    runTransaction
} from "firebase/firestore";
import { db } from "../firebaseConfig";

export class QuestManager {

    /**
     * ✅ NEW: Claim a completed quest reward (Passive Tracking System)
     * This handles the "Claim" button press on the Dashboard.
     */
    static async claimQuestReward(userId, questId) {
        try {
            console.log(`[QuestManager] Attempting to claim reward for quest: ${questId}`);

            return await runTransaction(db, async (transaction) => {
                const questRef = doc(db, "quests", questId);
                const userRef = doc(db, "users", userId);

                const questDoc = await transaction.get(questRef);
                const userDoc = await transaction.get(userRef);

                if (!questDoc.exists() || !userDoc.exists()) {
                    throw new Error("Quest or User not found");
                }

                const quest = questDoc.data();

                // ✅ FIX: Floating point tolerance (0.01) for distance quests
                // Checks if status is 'ready_to_claim' OR progress is met
                const isGoalMet = quest.progress >= (quest.goal - 0.01);
                const isComplete = quest.status === "ready_to_claim" || isGoalMet;

                // Debug log to see exactly why it might fail
                if (!isComplete) {
                    console.error(`[QuestManager] Validation Failed: Status=${quest.status}, Progress=${quest.progress}, Goal=${quest.goal}`);
                    throw new Error("Quest criteria not met yet.");
                }

                if (quest.status === "claimed") {
                    throw new Error("Reward already claimed.");
                }

                const xpReward = quest.xpReward || 50;
                const currentXP = userDoc.data().totalXP || 0;
                const newTotalXP = currentXP + xpReward;

                // Calculate new level (Simple formula: 1000 XP per level)
                const newLevel = Math.floor(newTotalXP / 1000) + 1;

                // 1. Award XP to User
                transaction.update(userRef, {
                    totalXP: newTotalXP,
                    level: newLevel,
                    completedQuests: increment(1),
                    lastActivityDate: serverTimestamp()
                });

                // 2. Mark Quest as Claimed
                transaction.update(questRef, {
                    status: "claimed",
                    claimedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                // 3. Log the Completion (Receipt)
                const completionRef = doc(collection(db, "quest_completions"));
                transaction.set(completionRef, {
                    userId,
                    questId,
                    title: quest.title,
                    xpEarned: xpReward,
                    claimedAt: serverTimestamp(),
                    activityType: quest.activityType
                });

                return {
                    success: true,
                    xpEarned: xpReward,
                    newLevel: newLevel,
                    title: quest.title
                };
            });
        } catch (error) {
            console.error("[QuestManager] Claim Error:", error);
            return { success: false, error: error.message };
        }
    }

    static async generateDailyQuests(userId, userStats) {
        try {
            console.log("[QuestManager] Generating daily quests for user:", userId);

            const existingQuestsSnapshot = await getDocs(
                query(
                    collection(db, "quests"),
                    where("userId", "==", userId),
                    where("status", "==", "active")
                )
            );
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todaysQuests = existingQuestsSnapshot.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .filter((quest) => {
                    if (!quest.createdAt) return false;
                    const createdAt = quest.createdAt.toDate ? quest.createdAt.toDate() : new Date(quest.createdAt);
                    return createdAt >= today;
                });

            if (todaysQuests.length > 0) {
                // --- Deduplication Logic ---
                const uniqueQuests = [];
                const seenQuestTypes = new Set();
                const duplicatesToDelete = [];

                for (const quest of todaysQuests) {
                    const identifier = quest.questId || quest.title;

                    if (seenQuestTypes.has(identifier)) {
                        duplicatesToDelete.push(quest.id);
                    } else {
                        seenQuestTypes.add(identifier);
                        uniqueQuests.push(quest);
                    }
                }

                if (duplicatesToDelete.length > 0) {
                    console.log(`[QuestManager] 🧹 Found ${duplicatesToDelete.length} duplicate quests. Cleaning up...`);
                    Promise.all(duplicatesToDelete.map(id => deleteDoc(doc(db, "quests", id))))
                        .catch(err => console.error("[QuestManager] Failed to delete duplicates", err));
                }

                return uniqueQuests;
            }

            // Generate NEW quests if none exist for today
            console.log("[QuestManager] No active quests found, generating new ones...");
            const questTemplates = this.getQuestTemplates(userStats);
            const newQuests = [];

            for (const template of questTemplates) {
                const questDoc = await addDoc(collection(db, "quests"), {
                    ...template,
                    userId: userId,
                    progress: 0,
                    status: "active",
                    attempts: 0,
                    createdAt: serverTimestamp(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                });

                newQuests.push({
                    id: questDoc.id,
                    ...template,
                    progress: 0,
                    status: "active",
                    attempts: 0,
                    createdAt: new Date(),
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                });
            }

            console.log(`[QuestManager] Created ${newQuests.length} new quests`);
            return newQuests;
        } catch (error) {
            console.error("[QuestManager] Error generating daily quests:", error);
            return [];
        }
    }

    /**
     * Load user's active quests
     */
    static async loadUserQuests(userId) {
        try {
            // Fetch 'active' AND 'ready_to_claim'
            const q = query(
                collection(db, "quests"),
                where("userId", "==", userId),
                where("status", "in", ["active", "ready_to_claim"])
            );

            const snapshot = await getDocs(q);
            const quests = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));

            console.log(`[QuestManager] Loaded ${quests.length} active/claimable quests`);
            return quests;
        } catch (error) {
            console.error("[QuestManager] Error loading quests:", error);
            return [];
        }
    }

    /**
     * Cleanup expired quests
     */
    static async cleanupExpiredQuests(userId) {
        try {
            const q = query(
                collection(db, "quests"),
                where("userId", "==", userId),
                where("status", "==", "active")
            );

            const snapshot = await getDocs(q);
            const now = new Date();
            let expiredCount = 0;

            for (const docSnapshot of snapshot.docs) {
                const quest = docSnapshot.data();
                const expiresAt = quest.expiresAt?.toDate ? quest.expiresAt.toDate() : new Date(quest.expiresAt);

                if (expiresAt <= now) {
                    await updateDoc(docSnapshot.ref, {
                        status: "expired",
                        updatedAt: serverTimestamp(),
                    });
                    expiredCount++;
                }
            }
            if (expiredCount > 0) console.log(`[QuestManager] Expired ${expiredCount} quests`);
        } catch (error) {
            console.error("[QuestManager] Error cleaning up expired quests:", error);
        }
    }

    /**
     * Get quest templates with dynamic goals
     */
    static getQuestTemplates(userStats) {
        const levelMultiplier = 1 + ((userStats.level || 1) - 1) * 0.1;

        return [
            {
                questId: "daily_distance",
                title: "Daily Distance",
                description: "Walk or run to reach the distance goal",
                unit: "distance",
                goal: Math.round(Math.max(2, userStats.avgDailyDistance * 1.1) * 10) / 10,
                difficulty: "easy",
                xpReward: Math.round(50 * levelMultiplier),
                category: "fitness",
                activityType: "any",
                type: "daily",
            },
            {
                questId: "strength_builder",
                title: "Strength Builder",
                description: "Complete push-ups or strength reps",
                unit: "reps",
                goal: Math.round(Math.max(20, userStats.avgDailyReps * 1.3)),
                difficulty: "hard",
                xpReward: Math.round(80 * levelMultiplier),
                category: "strength",
                activityType: "pushup",
                type: "daily",
            },
            {
                questId: "active_minutes",
                title: "Stay Active",
                description: "Log active minutes via any activity",
                unit: "duration",
                goal: Math.round(Math.max(30, userStats.avgActiveDuration * 1.15)),
                difficulty: "medium",
                xpReward: Math.round(60 * levelMultiplier),
                category: "consistency",
                activityType: "any",
                type: "daily",
            },
            {
                questId: "distance_explorer",
                title: "Runner's High",
                description: "Specific goal for running activities",
                unit: "distance",
                goal: Math.round(Math.max(3, userStats.avgDailyDistance * 1.2) * 10) / 10,
                difficulty: "medium",
                xpReward: Math.round(75 * levelMultiplier),
                category: "endurance",
                activityType: "running",
                type: "daily",
            },
            {
                questId: "cycling_adventure",
                title: "Cycling Adventure",
                description: "Hit the road on your bike",
                unit: "distance",
                goal: Math.round(Math.max(5, userStats.avgDailyDistance * 1.5) * 10) / 10,
                difficulty: "medium",
                xpReward: Math.round(70 * levelMultiplier),
                category: "endurance",
                activityType: "cycling",
                type: "daily",
            },
        ];
    }
}

export default QuestManager;