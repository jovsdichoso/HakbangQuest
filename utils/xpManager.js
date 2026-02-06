// utils/xpManager.js
import { doc, runTransaction, serverTimestamp, collection, increment, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { ActivityTypeManager, ACTIVITY_TYPES } from "./ActivityTypeManager";
import { QuestProgressManager } from "./QuestProgressManager";
import { checkAllParticipantsSubmitted, finalizeChallengeImmediate } from "./CommunityBackend";

export class XPManager {

    static getActivityMultiplierByMET(activityType) {
        const activityMETConfig = {
            'walking': { met: 3.5, multiplier: 1.0 },
            'jogging': { met: 7.0, multiplier: 1.4 },
            'running': { met: 8.0, multiplier: 1.6 },
            'cycling': { met: 6.0, multiplier: 1.3 },
            'pushup': { met: 3.8, multiplier: 1.2 },
            'push-ups': { met: 3.8, multiplier: 1.2 },
        };
        const config = activityMETConfig[activityType?.toLowerCase()];
        return config ? config.multiplier : 1.0;
    }

    static calculateBaseXP(activityType, isStrengthActivity) {
        const baseAmount = 100;
        const multiplier = this.getActivityMultiplierByMET(activityType);
        return Math.round(baseAmount * multiplier);
    }

    static async awardXPForActivity({
        userId,
        activityId,
        activityData,
        stats,
        activityParams = {},
        questData = null,
        challengeData = null,
        isStrengthActivity = false,
    }) {
        console.log(`[XPManager] 🚀 Processing ${activityData.activityType} for user ${userId}`);

        try {
            // STEP 1: PRE-FETCH ACTIVE QUESTS (The "Passive Scan" Fix)
            // We fetch IDs here to know what to read inside the transaction
            const questsRef = collection(db, "quests");
            const q = query(
                questsRef,
                where("userId", "==", userId),
                where("status", "in", ["active", "ready_to_claim"])
            );
            const questsSnapshot = await getDocs(q);
            const userQuestIds = questsSnapshot.docs.map(d => d.id);

            return await runTransaction(db, async (transaction) => {
                // =========================================================
                // PHASE 1: ALL READS (Must come before ANY writes)
                // =========================================================

                // 1. Receipt Check
                const receiptRef = doc(db, "activity_receipts", activityId);
                const receiptDoc = await transaction.get(receiptRef);
                if (receiptDoc.exists()) {
                    const rData = receiptDoc.data();
                    return { success: true, alreadyAwarded: true, xpEarned: rData.xpEarned };
                }

                // 2. User Data
                const userRef = doc(db, "users", userId);
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists()) throw new Error("User not found");
                const userData = userDoc.data();

                // 3. Challenge Data (Restored Logic)
                let challengeDoc = null;
                let challengeToUse = challengeData;
                if (challengeData && challengeData.id) {
                    const challengeRef = doc(db, "challenges", challengeData.id);
                    challengeDoc = await transaction.get(challengeRef);
                    if (challengeDoc.exists()) {
                        challengeToUse = { ...challengeData, ...challengeDoc.data() };
                    }
                }

                // 4. Quest Data (Passive Scan Read)
                const questDocs = [];
                for (const qId of userQuestIds) {
                    const qRef = doc(db, "quests", qId);
                    const qDoc = await transaction.get(qRef);
                    if (qDoc.exists()) questDocs.push({ ref: qRef, data: qDoc.data(), id: qId });
                }

                // =========================================================
                // PHASE 2: LOGIC & CALCULATIONS
                // =========================================================

                const completionCheck = this.checkActivityCompletion(stats, isStrengthActivity, challengeToUse);
                if (!completionCheck.isComplete) {
                    return { success: false, reason: completionCheck.reason, xpEarned: 0 };
                }

                const typeConfig = ActivityTypeManager.determineActivityType({
                    ...activityParams,
                    activityType: activityData?.activityType || "normal"
                });

                // --- QUEST UPDATES (Immediate Calculation) ---
                const questsToUpdate = [];
                let anyQuestCompleted = false;

                for (const qObj of questDocs) {
                    const quest = qObj.data;

                    // Check if activity matches quest type
                    const isMatching =
                        quest.activityType === 'any' ||
                        quest.activityType === activityData.activityType;

                    if (isMatching) {
                        const sessionValue = QuestProgressManager.getSessionValue(quest, stats, stats.calories || 0);

                        if (sessionValue > 0) {
                            const newProgress = (quest.progress || 0) + sessionValue;
                            const isGoalMet = newProgress >= (quest.goal - 0.01); // Float tolerance

                            // Determine status: If done, mark 'ready_to_claim' (don't auto-complete)
                            let newStatus = quest.status;
                            if (quest.status !== 'claimed' && quest.status !== 'completed') {
                                newStatus = isGoalMet ? 'ready_to_claim' : 'active';
                            }

                            console.log(`[XPManager] 🎯 Updating "${quest.title}": ${quest.progress} -> ${newProgress}`);

                            questsToUpdate.push({
                                ref: qObj.ref,
                                data: {
                                    progress: newProgress,
                                    status: newStatus,
                                    updatedAt: serverTimestamp()
                                },
                                // Metadata for logging
                                isGoalMet,
                                title: quest.title,
                                id: qObj.id,
                                xpReward: quest.xpReward
                            });

                            if (isGoalMet) anyQuestCompleted = true;
                        }
                    }
                }

                // Calculate XP
                const xpCalculation = this.calculateXPByType(
                    stats,
                    typeConfig,
                    null, // Pass null so we don't double-dip Quest XP (it's claimed later)
                    challengeToUse,
                    isStrengthActivity
                );
                const xpEarned = xpCalculation.totalXP;

                // =========================================================
                // PHASE 3: ALL WRITES (Atomic Updates)
                // =========================================================

                // 1. Update Quests (IMMEDIATE - Fixes the "Criteria Not Met" error)
                questsToUpdate.forEach(update => {
                    transaction.update(update.ref, update.data);

                    // Optional: Log completion timestamp if just finished
                    if (update.isGoalMet) {
                        const logRef = doc(collection(db, "quest_completions"));
                        transaction.set(logRef, {
                            userId,
                            questId: update.id,
                            title: update.title,
                            xpEarned: update.xpReward || 50,
                            completedAt: serverTimestamp(),
                            activityId,
                            status: "ready_to_claim"
                        });
                    }
                });

                // 2. Update User Stats
                const userUpdateData = {
                    totalXP: (userData.totalXP || 0) + xpEarned,
                    level: Math.floor(((userData.totalXP || 0) + xpEarned) / 1000) + 1,
                    lastActivityDate: serverTimestamp(),
                    totalActivities: increment(1),
                    updatedAt: serverTimestamp(),
                };

                if (userData.xp === undefined) userUpdateData.xp = xpEarned;
                else userUpdateData.xp = increment(xpEarned);

                const caloriesEarned = stats.calories || activityData.calories || 0;
                userUpdateData.totalCalories = increment(caloriesEarned);

                if (isStrengthActivity) {
                    userUpdateData.totalReps = increment(stats.reps || 0);
                    userUpdateData.totalStrengthDuration = increment(stats.duration || 0);
                } else {
                    userUpdateData.totalDistance = increment((stats.distance || 0) / 1000);
                    userUpdateData.totalSteps = increment(stats.steps || 0);
                    userUpdateData.totalDuration = increment(stats.duration || 0);
                }

                this.updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation);
                transaction.update(userRef, userUpdateData);

                // 3. Save Activity (Fixes Data Overwrite)
                const collectionName = this.getCollectionForActivityType(typeConfig.type);
                const activityRef = doc(db, collectionName, activityId);

                transaction.set(activityRef, {
                    ...activityData,
                    activityType: activityData.activityType, // ✅ Keeps specific type (e.g. "pushup")
                    activityCategory: typeConfig.type,       // ✅ Stores category separately (e.g. "normal")
                    xpEarned,
                    bonusXP: xpCalculation.bonusXP,
                    questCompleted: anyQuestCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    questId: questData?.id || null,
                    challengeId: challengeToUse?.id || null,
                    userId: userId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });

                // 4. Update Challenge (Restored Logic)
                if (challengeToUse && challengeDoc && challengeDoc.exists()) {
                    const challengeWasFinalized = await this.handleChallengeProgress(
                        transaction,
                        userId,
                        challengeToUse,
                        challengeDoc,
                        stats,
                        xpCalculation,
                        activityId,
                        isStrengthActivity,
                    );

                    if (challengeWasFinalized) {
                        xpCalculation.challengeCompleted = true;
                    }
                }

                // 5. Create Receipt
                transaction.set(receiptRef, {
                    userId,
                    activityId,
                    xpEarned,
                    awardedAt: serverTimestamp()
                });

                return {
                    success: true,
                    xpEarned,
                    baseXP: xpCalculation.baseXP,
                    bonusXP: xpCalculation.bonusXP,
                    questCompleted: anyQuestCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    levelUp: userUpdateData.level > (userData.level || 1),
                    newLevel: userUpdateData.level
                };
            });

        } catch (error) {
            console.error("[XPManager] ❌ Error awarding XP:", error);
            return { success: false, reason: "Failed to process activity." };
        }
    }

    // --- HELPER METHODS ---

    static getCollectionForActivityType(type) {
        return type === ACTIVITY_TYPES.CHALLENGE ? "challenge_activities" : "normal_activities";
    }

    static calculateXPByType(stats, typeConfig, questData, challengeData, isStrengthActivity) {
        const isNormalActivity = typeConfig.type === 'normal';

        const baseXP = isNormalActivity ? this.calculateBaseXP(stats.activityType, isStrengthActivity) : 0;
        const bonusXP = isNormalActivity ? this.calculatePerformanceBonusXP(stats, isStrengthActivity) : 0;

        let challengeXP = 0;
        let challengeCompleted = false;

        // Restored Challenge XP Logic
        if (challengeData && challengeData.groupType === 'solo') {
            const result = this.calculateChallengeXP(stats, challengeData, isStrengthActivity);
            challengeXP = result.xp;
            challengeCompleted = result.completed;
        }

        // Quest XP is 0 here because it is claimed manually via the Dashboard
        const questXP = 0;

        return {
            baseXP,
            bonusXP,
            questXP,
            challengeXP,
            totalXP: baseXP + bonusXP + questXP + challengeXP,
            challengeCompleted,
        };
    }

    static calculateChallengeXP(stats, challengeData, isStrengthActivity) {
        const progressValue = this.getProgressValueForChallenge(stats, challengeData, isStrengthActivity);
        const goal = challengeData.goal || 0;
        const completed = goal > 0 && progressValue >= goal;
        const xp = completed ? (challengeData.xpReward || 100) : 0;
        return { xp, completed };
    }

    static getProgressValueForChallenge(stats, challengeData, isStrengthActivity) {
        const unit = challengeData.unit?.toLowerCase() || "";
        switch (unit) {
            case "reps": return stats.reps || 0;
            case "distance": return (stats.distance || 0) / 1000;
            case "duration": return (stats.duration || 0) / 60;
            case "steps": return stats.steps || 0;
            case "calories": return stats.calories || 0;
            default: return 0;
        }
    }

    static async handleChallengeProgress(transaction, userId, challengeData, challengeDoc, stats, xpCalculation, activityId, isStrengthActivity) {
        try {
            const challengeRef = challengeDoc.ref;
            const challenge = challengeDoc.data();

            if (challenge.status?.global === 'completed') return false;

            let progressValue = this.getProgressValueForChallenge(stats, challenge, isStrengthActivity);
            const currentProgress = challenge.progress?.[userId] || 0;
            const newProgress = currentProgress + progressValue;

            const goal = challenge.goal || 0;
            const isCompletedByGoal = goal > 0 && newProgress >= goal;
            const newUserStatus = isCompletedByGoal ? "completed" : "in_progress";

            // Update Challenge
            transaction.update(challengeRef, {
                [`progress.${userId}`]: newProgress,
                [`status.${userId}`]: newUserStatus,
                lastUpdated: serverTimestamp()
            });

            // Log Participation
            const participationRef = doc(collection(db, "challenge_participations"));
            transaction.set(participationRef, {
                challengeId: challengeData.id,
                userId,
                activityId,
                progressValue,
                totalProgress: newProgress,
                completed: isCompletedByGoal,
                participatedAt: serverTimestamp(),
            });

            // Check for Winner (Duo/Lobby)
            const isRaceChallenge = challengeData.completionRequirement === "betterthanothers";
            const isDuoReady = challengeData.groupType === "duo" && challengeData.participants?.length === 2;
            const isLobbyReady = challengeData.groupType === "lobby" && (challengeData.participants?.length || 0) >= 2;

            if (isRaceChallenge && (isDuoReady || isLobbyReady)) {
                const updatedProgressMap = { ...challenge.progress, [userId]: newProgress };
                if (checkAllParticipantsSubmitted({ ...challengeData, progress: updatedProgressMap })) {
                    await finalizeChallengeImmediate(transaction, challengeRef, { ...challengeData, progress: updatedProgressMap });
                    return true;
                }
            }

            // Solo Completion
            if (challengeData.groupType === 'solo' && isCompletedByGoal) {
                transaction.update(challengeRef, {
                    'status.global': 'completed',
                    winnerId: userId,
                    updatedAt: serverTimestamp(),
                });
                return true;
            }

            return false;
        } catch (e) {
            console.error("Challenge Progress Error:", e);
            return false;
        }
    }

    static calculatePerformanceBonusXP(stats, isStrengthActivity) {
        let bonusXP = 0;
        const multiplier = stats.activityType ? this.getActivityMultiplierByMET(stats.activityType) : 1.0;

        if (isStrengthActivity) {
            bonusXP += Math.floor((stats.reps || 0) / 5) * 1;
            bonusXP += Math.floor((stats.duration || 0) / 120) * 1;
        } else {
            const km = (stats.distance || 0) / 1000;
            bonusXP += Math.floor(km / 0.5) * Math.max(1, multiplier);
            bonusXP += Math.floor((stats.duration || 0) / 300) * multiplier;
            bonusXP += Math.floor((stats.steps || 0) / 500) * 1;

            const elevation = stats.elevationGain || 0;
            if (elevation > 0) {
                bonusXP += Math.min(Math.floor(elevation / 10) * 2, 50);
            }
        }
        return Math.min(bonusXP, 150);
    }

    static updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation) {
        switch (typeConfig.type) {
            case ACTIVITY_TYPES.CHALLENGE:
                userUpdateData.totalChallengeActivities = increment(1);
                if (xpCalculation.challengeCompleted) userUpdateData.completedChallenges = increment(1);
                break;
            case ACTIVITY_TYPES.QUEST:
                userUpdateData.totalQuestActivities = increment(1);
                break;
            default:
                userUpdateData.totalNormalActivities = increment(1);
        }
    }

    static checkActivityCompletion(stats, isStrength, challenge) {
        if (isStrength && (stats.reps || 0) < 1) return { isComplete: false, reason: "No reps detected" };
        if (!isStrength && (stats.distance || 0) < 10) return { isComplete: false, reason: "Distance too short" };
        return { isComplete: true };
    }

    static generateActivityId(userId, time, type) {
        return `${userId}_${time}_${type}_${Math.random().toString(36).substr(2, 5)}`;
    }
}

export default XPManager;