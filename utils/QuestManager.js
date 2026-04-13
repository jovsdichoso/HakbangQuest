import {
    doc,
    getDoc,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    serverTimestamp,
    increment,
    runTransaction,
    Timestamp
} from "firebase/firestore";
import { db } from "../firebaseConfig";

export class QuestManager {

    // ==========================================================
    //  ✅ CORE: PASSIVE TRACKING & AUTO-COMPLETION
    // ==========================================================

    static async checkAndProcessQuests(userId) {
        try {
            console.log(`[QuestManager] 🔄 Processing passive quest updates for user: ${userId}`);

            // 1. Define "Today" (Local start of day)
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            // 2. Fetch ALL activity collections
            const collectionsToCheck = [
                "activities",
                "normal_activities",
                "challenge_activities",
                "quest_activities"
            ];

            const fetchPromises = collectionsToCheck.map(colName => {
                const q = query(
                    collection(db, colName),
                    where("userId", "==", userId),
                    where("createdAt", ">=", startOfDay)
                );
                return getDocs(q);
            });

            const snapshots = await Promise.all(fetchPromises);
            const allDocs = snapshots.flatMap(snap => snap.docs);
            
            // Deduplicate
            const uniqueDocsMap = new Map();
            allDocs.forEach(d => uniqueDocsMap.set(d.id, d.data()));
            const uniqueActivities = Array.from(uniqueDocsMap.values());

            const dailyStats = {
                distance: 0, 
                duration: 0, 
                reps: 0,     
                calories: 0,
                runningDistance: 0,
                cyclingDistance: 0
            };

            // 3. Aggregate Stats
            uniqueActivities.forEach(data => {
                if (this._validateActivity(data)) {
                    const dist = Number(data.distance || 0);
                    const dur = Number(data.duration || data.durationSeconds || 0);
                    
                    dailyStats.distance += dist; 
                    dailyStats.duration += dur;
                    dailyStats.reps += Number(data.reps || 0);
                    dailyStats.calories += Number(data.calories || 0);

                    if (data.activityType === 'running') dailyStats.runningDistance += dist;
                    if (data.activityType === 'cycling') dailyStats.cyclingDistance += dist;
                }
            });

            console.log("[QuestManager] 📊 Daily Stats Calculated:", dailyStats);

            // 4. Fetch Active Quests
            const questsQuery = query(
                collection(db, "quests"),
                where("userId", "==", userId),
                where("status", "==", "active")
            );
            
            const questsSnap = await getDocs(questsQuery);

            // 5. Evaluate Each Quest
            const evaluationPromises = questsSnap.docs.map(async (questDoc) => {
                const quest = questDoc.data();
                let currentProgress = 0;

                if (quest.activityType === 'running' && quest.unit === 'distance') {
                    currentProgress = dailyStats.runningDistance / 1000; 
                } 
                else if (quest.activityType === 'cycling' && quest.unit === 'distance') {
                    currentProgress = dailyStats.cyclingDistance / 1000;
                } 
                else if (quest.unit === 'distance') {
                    currentProgress = dailyStats.distance / 1000; // km
                } 
                else if (quest.unit === 'duration') {
                    currentProgress = dailyStats.duration / 60; // minutes
                } 
                else if (quest.unit === 'reps') {
                    currentProgress = dailyStats.reps;
                } 
                else if (quest.unit === 'calories') {
                    currentProgress = dailyStats.calories;
                }

                currentProgress = Math.round(currentProgress * 100) / 100;

                const isGoalMet = currentProgress >= quest.goal;

                if (isGoalMet) {
                    await this._processQuestCompletion(userId, questDoc.id, quest, currentProgress);
                } else {
                    if (currentProgress !== quest.progress) {
                        await updateDoc(questDoc.ref, { 
                            progress: currentProgress,
                            updatedAt: serverTimestamp() 
                        });
                    }
                }
            });

            await Promise.all(evaluationPromises);
            console.log("[QuestManager] ✅ Passive processing complete.");

        } catch (error) {
            console.error("[QuestManager] ❌ Error processing quests:", error);
        }
    }

    static async _processQuestCompletion(userId, questId, questData, finalProgress) {
        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, "users", userId);
                const questRef = doc(db, "quests", questId);

                const freshQuestSnap = await transaction.get(questRef);
                if (!freshQuestSnap.exists() || freshQuestSnap.data().status === 'completed') {
                    return; 
                }

                const userDoc = await transaction.get(userRef);
                const currentXP = userDoc.exists() ? (userDoc.data().totalXP || 0) : 0;
                const newTotalXP = currentXP + questData.xpReward;
                const newLevel = Math.floor(newTotalXP / 1000) + 1;

                transaction.update(userRef, {
                    totalXP: newTotalXP,
                    level: newLevel,
                    completedQuests: increment(1),
                    lastActivityDate: serverTimestamp()
                });

                transaction.update(questRef, {
                    status: "completed", 
                    progress: finalProgress,
                    completedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                const historyRef = doc(collection(db, "quest_history"));
                transaction.set(historyRef, {
                    userId,
                    questId,
                    title: questData.title,
                    xpEarned: questData.xpReward,
                    completedAt: serverTimestamp(),
                    type: "passive_daily"
                });
            });
            console.log(`[QuestManager] 🏆 Quest "${questData.title}" Completed! +${questData.xpReward} XP`);
        } catch (error) {
            console.error(`[QuestManager] Transaction failed for quest ${questId}:`, error);
        }
    }

    static _validateActivity(data) {
        const duration = Number(data.duration || data.durationSeconds || 0);
        const type = data.activityType || 'unknown';
        const reps = Number(data.reps || 0);

        if (['pushup', 'push-ups', 'situp', 'squat'].includes(type) || reps > 0) {
             if (duration > 0 || reps > 0) return true;
        }

        if (duration < 30) return false;

        const distanceMeters = Number(data.distance || 0);
        if (duration > 0 && distanceMeters > 0) {
            const speedMps = distanceMeters / duration;
            if (type === 'cycling' && speedMps > 17) return false; 
            if (['walking', 'running', 'jogging'].includes(type) && speedMps > 7) return false; 
        }

        return true;
    }

    // ==========================================================
    //  📅 DAILY QUEST GENERATION (✅ FIXED TRANSACTION)
    // ==========================================================

    static async generateDailyQuests(userId, userStats) {
        try {
            console.log("[QuestManager] Checking/Generating daily quests...");

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const dateStr = startOfDay.toISOString().split('T')[0];

            const templates = this.getQuestTemplates(userStats);

            const activeQuests = await runTransaction(db, async (transaction) => {
                const results = [];
                
                // 1. Prepare all reads
                const reads = templates.map(template => {
                    const uniqueQuestId = `q_${userId}_${dateStr}_${template.id}`;
                    const questRef = doc(db, "quests", uniqueQuestId);
                    return { ref: questRef, template, id: uniqueQuestId };
                });

                // 2. Execute reads
                const snapshots = await Promise.all(reads.map(r => transaction.get(r.ref)));

                // 3. Execute writes only if needed
                snapshots.forEach((snap, index) => {
                    const item = reads[index];
                    
                    if (!snap.exists()) {
                        // Create new quest (Allowed by 'allow create' rule)
                        const questData = {
                            ...item.template,
                            id: item.id,
                            userId: userId,
                            progress: 0,
                            status: "active",
                            createdAt: serverTimestamp(),
                            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                        };
                        transaction.set(item.ref, questData);
                        results.push(questData);
                    } else {
                        // Return existing (Allowed by 'allow read')
                        results.push({ id: item.id, ...snap.data() });
                    }
                });

                return results;
            });

            console.log(`[QuestManager] Processed ${activeQuests.length} daily quests.`);
            return activeQuests;

        } catch (error) {
            console.error("[QuestManager] Error generating daily quests:", error);
            return [];
        }
    }

    static async loadUserQuests(userId) {
        try {
            const q = query(
                collection(db, "quests"),
                where("userId", "==", userId),
                where("status", "in", ["active", "completed"])
            );

            const snapshot = await getDocs(q);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            return snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(quest => {
                    const qDate = quest.createdAt?.toDate ? quest.createdAt.toDate() : new Date(quest.createdAt);
                    return qDate >= today;
                });
        } catch (error) {
            console.error("[QuestManager] Error loading quests:", error);
            return [];
        }
    }

    static async cleanupExpiredQuests(userId) {
        try {
            const q = query(
                collection(db, "quests"),
                where("userId", "==", userId),
                where("status", "==", "active")
            );

            const snapshot = await getDocs(q);
            const now = new Date();

            for (const docSnapshot of snapshot.docs) {
                const quest = docSnapshot.data();
                const expiresAt = quest.expiresAt?.toDate ? quest.expiresAt.toDate() : new Date(quest.expiresAt);

                if (expiresAt <= now) {
                    await updateDoc(docSnapshot.ref, {
                        status: "expired",
                        updatedAt: serverTimestamp(),
                    });
                }
            }
        } catch (error) {
            console.error("[QuestManager] Error cleaning up quests:", error);
        }
    }

    static getQuestTemplates(userStats) {
        const levelMultiplier = 1 + ((userStats.level || 1) - 1) * 0.1;
        
        const safeDistance = Math.max(1, userStats.avgDailyDistance || 2);
        const safeReps = Math.max(10, userStats.avgDailyReps || 15);
        const safeDuration = Math.max(15, userStats.avgActiveDuration || 30);

        return [
            {
                id: "daily_mover", 
                title: "Daily Mover",
                description: "Walk, jog, run, or cycle to reach your goal.",
                unit: "distance",
                goal: Math.round(safeDistance * 1.1 * 10) / 10,
                difficulty: "easy",
                xpReward: Math.round(50 * levelMultiplier),
                category: "fitness",
                activityType: "any",
                type: "daily",
            },
            {
                id: "pushup_master", 
                title: "Push-Up Master",
                description: "Build upper body strength with push-ups.",
                unit: "reps",
                goal: Math.round(safeReps * 1.2),
                difficulty: "medium",
                xpReward: Math.round(80 * levelMultiplier),
                category: "strength",
                activityType: "pushup",
                type: "daily",
            },
            {
                id: "active_minutes",
                title: "Active Minutes",
                description: "Log active minutes across any activity.",
                unit: "duration",
                goal: Math.round(safeDuration),
                difficulty: "easy",
                xpReward: Math.round(60 * levelMultiplier),
                category: "endurance",
                activityType: "any",
                type: "daily",
            }
        ];
    }
}

export default QuestManager;