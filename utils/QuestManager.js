// utils/QuestManager.js
import {
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc, // <--- ADDED THIS IMPORT
    collection,
    query,
    where,
    serverTimestamp,
    increment,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

export class QuestManager {
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
                // --- FIX START: Deduplication Logic ---
                // If we found quests, let's make sure they are unique. 
                // This fixes the "18 quests" issue if it already happened.
                const uniqueQuests = [];
                const seenQuestTypes = new Set();
                const duplicatesToDelete = [];

                for (const quest of todaysQuests) {
                    // Use questId (from template) or title to identify duplicates
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
                    // Delete duplicates in background to fix the database
                    Promise.all(duplicatesToDelete.map(id => deleteDoc(doc(db, "quests", id))))
                        .then(() => console.log("[QuestManager] Duplicates deleted successfully"))
                        .catch(err => console.error("[QuestManager] Failed to delete duplicates", err));
                }

                console.log(`[QuestManager] Returning ${uniqueQuests.length} unique active quests (filtered from ${todaysQuests.length})`);
                return uniqueQuests;
                // --- FIX END ---
            }

            // Generate NEW quests with FIXED goals
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
            const q = query(
                collection(db, "quests"),
                where("userId", "==", userId),
                where("status", "==", "active")
            );

            const snapshot = await getDocs(q);
            const quests = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));

            console.log(`[QuestManager] Loaded ${quests.length} active quests`);
            return quests;
        } catch (error) {
            console.error("[QuestManager] Error loading quests:", error);
            return [];
        }
    }

    /**
     * Update quest progress after activity completion
     */
    static async updateQuestProgress(questId, activityData, activityId) {
        try {
            const questRef = doc(db, "quests", questId);
            const questDoc = await getDoc(questRef);

            if (!questDoc.exists()) {
                console.warn("[QuestManager] Quest not found:", questId);
                return null;
            }

            const quest = questDoc.data();
            let valueContributed = 0;

            // Calculate contribution based on unit
            if (quest.unit === "reps") {
                valueContributed = activityData.reps || 0;
            } else if (quest.unit === "distance") {
                valueContributed = (activityData.distance || 0) / 1000; // Convert to km
            } else if (quest.unit === "duration") {
                valueContributed = (activityData.duration || 0) / 60; // Convert to minutes
            } else if (quest.unit === "calories") {
                valueContributed = activityData.calories || 0;
            } else if (quest.unit === "steps") {
                valueContributed = activityData.steps || 0;
            }

            const newProgress = quest.progress + valueContributed;
            const isCompleted = newProgress >= quest.goal;

            // Update quest document
            await updateDoc(questRef, {
                progress: newProgress,
                status: isCompleted ? "completed" : "active",
                completedAt: isCompleted ? serverTimestamp() : null,
                attempts: increment(1),
                updatedAt: serverTimestamp(),
            });

            // Track this contribution in quest_progress collection
            await addDoc(collection(db, "quest_progress"), {
                questId: questId,
                userId: quest.userId,
                activityId: activityId,
                valueContributed: valueContributed,
                timestamp: serverTimestamp(),
                questStatus: isCompleted ? "completed" : "active",
            });

            console.log(
                `[QuestManager] Quest updated: ${questId}, Progress: ${newProgress}/${quest.goal}, Completed: ${isCompleted}`
            );

            return {
                completed: isCompleted,
                progress: newProgress,
                goal: quest.goal,
                quest: quest,
            };
        } catch (error) {
            console.error("[QuestManager] Error updating quest progress:", error);
            return null;
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

            console.log(`[QuestManager] Expired ${expiredCount} quests`);
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
                title: "Daily Distance Challenge",
                description: "Reach your daily distance goal",
                unit: "distance",
                goal: Math.round(Math.max(2, userStats.avgDailyDistance * 1.1) * 10) / 10,
                difficulty: "easy",
                xpReward: Math.round(50 * levelMultiplier),
                category: "fitness",
                activityType: "walking",
                type: "daily",
            },
            {
                questId: "strength_builder",
                title: "Strength Builder",
                description: "Complete your strength training reps",
                unit: "reps",
                goal: Math.round(Math.max(20, userStats.avgDailyReps * 1.3)), // ✅ Whole number
                difficulty: "hard",
                xpReward: Math.round(80 * levelMultiplier),
                category: "strength",
                activityType: "pushup",
                type: "daily",
            },
            {
                questId: "active_minutes",
                title: "Stay Active",
                description: "Maintain activity for the target duration",
                unit: "duration",
                goal: Math.round(Math.max(30, userStats.avgActiveDuration * 1.15)), // ✅ Whole number
                difficulty: "medium",
                xpReward: Math.round(60 * levelMultiplier),
                category: "consistency",
                activityType: "jogging",
                type: "daily",
            },
            {
                questId: "distance_explorer",
                title: "Distance Explorer",
                description: "Cover your target distance today",
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
                description: "Complete a cycling session",
                unit: "distance",
                goal: Math.round(Math.max(5, userStats.avgDailyDistance * 1.5) * 10) / 10,
                difficulty: "medium",
                xpReward: Math.round(70 * levelMultiplier),
                category: "endurance",
                activityType: "cycling",
                type: "daily",
            },
            {
                questId: "flexibility_focus",
                title: "Flexibility Focus",
                description: "Complete stretching or yoga session",
                unit: "duration",
                goal: Math.round(Math.max(15, userStats.avgActiveDuration * 0.5)),
                difficulty: "easy",
                xpReward: Math.round(40 * levelMultiplier),
                category: "flexibility",
                activityType: "yoga",
                type: "daily",
            },
        ];
    }
}

export default QuestManager;