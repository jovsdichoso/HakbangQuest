// xpManager.js - COMPLETE FIXED VERSION (Robust against Missing 'xp' Field)
import { doc, runTransaction, serverTimestamp, collection, increment } from "firebase/firestore"
import { db } from "../firebaseConfig"
import { ActivityTypeManager, ACTIVITY_TYPES } from "./ActivityTypeManager"
import { QuestProgressManager } from "./QuestProgressManager"
import { checkAllParticipantsSubmitted, finalizeChallengeImmediate } from "./CommunityBackend"

export class XPManager {
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
        console.log("[XPManager] Starting XP award process for activity:", activityId)
        console.log("[XPManager] Activity Params:", activityParams)
        console.log("[XPManager] Quest Data:", questData)
        console.log("[XPManager] Challenge Data:", challengeData)
        console.log("[XPManager] Is Strength Activity:", isStrengthActivity)

        try {
            return await runTransaction(db, async (transaction) => {
                console.log("[XPManager] Transaction started")

                // 1. Check if XP was already awarded
                const receiptRef = doc(db, "activity_receipts", activityId)
                const receiptDoc = await transaction.get(receiptRef)

                if (receiptDoc.exists()) {
                    console.log("[XPManager] XP already awarded for this activity")
                    const receiptData = receiptDoc.data()
                    return {
                        success: true,
                        alreadyAwarded: true,
                        xpEarned: receiptData.xpEarned,
                        questCompleted: receiptData.questCompleted || false,
                        challengeCompleted: receiptData.challengeCompleted || false,
                    }
                }

                // 2. Get user document
                const userRef = doc(db, "users", userId)
                const userDoc = await transaction.get(userRef)

                if (!userDoc.exists()) {
                    console.error("[XPManager] User document not found:", userId)
                    throw new Error("User document not found")
                }

                const userData = userDoc.data()
                console.log("[XPManager] User data loaded:", {
                    level: userData.level,
                    totalXP: userData.totalXP,
                    xp: userData.xp, // Check for 'xp' explicitly
                    totalActivities: userData.totalActivities
                })

                // 3. Load challenge document if applicable
                let challengeDoc = null
                let challengeRef = null
                let challengeToUse = challengeData

                if (challengeData && challengeData.id) {
                    challengeRef = doc(db, "challenges", challengeData.id)
                    challengeDoc = await transaction.get(challengeRef)

                    if (challengeDoc.exists()) {
                        console.log("[XPManager] Challenge document found:", challengeData.id)
                        challengeToUse = {
                            ...challengeData,
                            ...challengeDoc.data()
                        }
                    } else {
                        console.warn(`[XPManager] Challenge not found: ${challengeData.id}`)
                        challengeToUse = null
                    }
                }

                // 4. Check minimum activity completion criteria
                const completionCheck = this.checkActivityCompletion(stats, isStrengthActivity, challengeToUse);
                if (!completionCheck.isComplete) {
                    console.log(`[XPManager] Activity failed completion criteria: ${completionCheck.reason}`);
                    return {
                        success: false,
                        reason: completionCheck.reason,
                        xpEarned: 0,
                        questCompleted: false,
                        challengeCompleted: false,
                    };
                }

                // 5. Determine activity type with proper fallback
                const typeConfig = ActivityTypeManager.determineActivityType({
                    ...activityParams,
                    activityType: activityData?.activityType || "normal"
                })

                console.log("[XPManager] Activity type config:", typeConfig)

                // 6. Calculate XP
                const xpCalculation = this.calculateXPByType(
                    stats,
                    typeConfig,
                    questData,
                    challengeToUse,
                    isStrengthActivity
                )

                console.log("[XPManager] XP Calculation:", xpCalculation)

                // 7. Calculate new user XP and level
                // Use 'xp' field primarily, fallback to 'totalXP'
                const currentTotalXP = userData.xp || userData.totalXP || 0
                const currentLevel = userData.level || 1
                const xpEarned = xpCalculation.totalXP // XP earned from this activity
                const newTotalXP = currentTotalXP + xpEarned
                const newLevel = Math.floor(newTotalXP / 1000) + 1
                const levelUp = newLevel > currentLevel

                console.log("[XPManager] XP Update:", {
                    currentTotalXP,
                    xpEarned,
                    newTotalXP,
                    currentLevel,
                    newLevel,
                    levelUp
                })

                // 8. Prepare user document updates
                const userUpdateData = {
                    totalXP: newTotalXP, // Legacy field, keeping in sync
                    level: newLevel,
                    lastActivityDate: serverTimestamp(),
                    totalActivities: increment(1),
                    updatedAt: serverTimestamp(),
                }

                // 8.5. CRITICAL FIX: Conditionally set/update the 'xp' field based on existence.
                // We use 'xp' for the main transaction updates now.
                if (userData.xp === undefined || userData.xp === null) {
                    // If xp field doesn't exist, set the initial value to the earned XP.
                    userUpdateData.xp = xpEarned;
                } else {
                    // If xp field exists (and is a number), use increment.
                    userUpdateData.xp = increment(xpEarned);
                }

                // If 'totalXP' exists, ensure it's also incremented for backward compatibility
                if (userData.totalXP !== undefined && userData.totalXP !== null) {
                    userUpdateData.totalXP = increment(xpEarned);
                }


                // Add activity-specific stats
                if (isStrengthActivity) {
                    userUpdateData.totalReps = increment(stats.reps || 0)
                    userUpdateData.totalStrengthDuration = increment(stats.duration || 0)
                } else {
                    const distanceInKm = (stats.distance || 0) / 1000
                    userUpdateData.totalDistance = increment(distanceInKm)
                    userUpdateData.totalSteps = increment(stats.steps || 0)
                    userUpdateData.totalDuration = increment(stats.duration || 0)
                }

                // Update type-specific stats
                this.updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation)

                // 9. Update user document
                transaction.update(userRef, userUpdateData)
                console.log("[XPManager] User document update prepared")

                // 10. Prepare activity data
                const completeActivityData = {
                    ...activityData,
                    activityType: typeConfig.type,
                    xpEarned: xpEarned,
                    bonusXP: xpCalculation.bonusXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    questId: questData?.id || null,
                    challengeId: challengeToUse?.id || null,
                    userId: userId,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }

                // 11. Save to appropriate collection based on activity type
                const collectionName = this.getCollectionForActivityType(typeConfig.type)
                const activityRef = doc(db, collectionName, activityId)

                console.log("[XPManager] Saving to collection:", collectionName)
                transaction.set(activityRef, completeActivityData)

                // 12. Handle quest completion
                if (xpCalculation.questCompleted && questData) {
                    console.log("[XPManager] Quest completed, creating completion record")
                    await this.handleQuestCompletion(
                        transaction,
                        userId,
                        questData,
                        typeConfig,
                        xpCalculation,
                        activityId,
                        stats,
                        isStrengthActivity,
                    )
                }

                // 13. Handle challenge progress
                if (challengeToUse && challengeDoc && challengeDoc.exists()) {
                    console.log("[XPManager] Processing challenge progress")
                    const challengeWasFinalized = await this.handleChallengeProgress(
                        transaction,
                        userId,
                        challengeToUse,
                        challengeDoc,
                        stats,
                        xpCalculation,
                        activityId,
                        isStrengthActivity,
                    )

                    if (challengeWasFinalized) {
                        xpCalculation.challengeCompleted = true
                    }
                }

                // 14. Create XP receipt (immutable record)
                const receiptData = {
                    userId,
                    activityId,
                    activityType: typeConfig.type,
                    xpEarned: xpEarned,
                    baseXP: xpCalculation.baseXP,
                    bonusXP: xpCalculation.bonusXP,
                    questXP: xpCalculation.questXP,
                    challengeXP: xpCalculation.challengeXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    awardedAt: serverTimestamp(),
                }

                transaction.set(receiptRef, receiptData)
                console.log("[XPManager] Receipt created")

                console.log("[XPManager] ✅ XP awarded successfully:", {
                    activityType: typeConfig.type,
                    totalXP: xpEarned,
                    newLevel,
                    levelUp,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                })

                return {
                    success: true,
                    alreadyAwarded: false,
                    activityType: typeConfig.type,
                    xpEarned: xpEarned,
                    baseXP: xpCalculation.baseXP,
                    bonusXP: xpCalculation.bonusXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    levelUp,
                    newLevel,
                }
            })
        } catch (error) {
            console.error("[XPManager] ❌ Error awarding XP:", error)
            console.error("[XPManager] Error details:", {
                code: error.code,
                message: error.message,
                stack: error.stack
            })

            // Return detailed error for debugging
            return {
                success: false,
                error: error.message,
                code: error.code,
                reason: "Failed to process activity. Please check permissions and try again."
            }
        }
    }

    static getCollectionForActivityType(activityType) {
        // Map activity types to Firestore collections
        switch (activityType) {
            case ACTIVITY_TYPES.CHALLENGE:
                return "challenge_activities"
            case ACTIVITY_TYPES.QUEST:
                return "quest_activities"
            case "normal":
            default:
                return "normal_activities"
        }
    }

    static calculateXPByType(stats, typeConfig, questData, challengeData, isStrengthActivity) {
        console.log("[XPManager] Calculating XP:", {
            type: typeConfig.type,
            questData: !!questData,
            challengeData: !!challengeData,
            isStrengthActivity
        })

        const isQuestOrChallenge = typeConfig.type === ACTIVITY_TYPES.QUEST || typeConfig.type === ACTIVITY_TYPES.CHALLENGE

        // FIX: Explicitly check if it's a Quest that IS NOT also a Challenge.
        // ActivityTypeManager assigns 'QUEST' if a questId is present, even if it's a Challenge.
        const isNonChallengeQuest = typeConfig.type === ACTIVITY_TYPES.QUEST && !challengeData;
        const isNormalActivity = typeConfig.type === 'normal';

        // 1. Base XP logic: Only for normal activities OR non-Challenge Quests
        // Base XP is 0 for all stake Challenges (XP is gained by winning the pot)
        const baseXP = (isNormalActivity || isNonChallengeQuest) ? 50 : 0;

        // 2. Performance bonus XP: Only awarded for activities that give Base XP
        const bonusXP = (isNormalActivity || isNonChallengeQuest) ? this.calculatePerformanceBonusXP(stats, isStrengthActivity) : 0;

        // 3. Quest XP calculation
        let questXP = 0
        let questCompleted = false
        let achievedValue = 0

        if (questData) {
            const questResult = this.calculateQuestXP(stats, questData, isStrengthActivity)

            // Only award extra quest XP if it's a dedicated Non-Challenge Quest
            if (isNonChallengeQuest) {
                questXP = questResult.xp
            }

            questCompleted = questResult.completed // Check if goal was met
            achievedValue = questResult.achievedValue
        }

        // 4. Challenge XP (This should always be 0 here for stake challenges)
        let challengeXP = 0
        let challengeCompleted = false

        if (challengeData && !isNonChallengeQuest) {
            // Check if activity completes the challenge goal (even if it's a race, the progress update handles the finalization)
            const challengeResult = this.calculateChallengeXP(stats, challengeData, isStrengthActivity);
            challengeCompleted = challengeResult.completed;
            challengeXP = challengeResult.xp; // Will be 0 for stake challenges
        }

        // 5. Total XP calculation
        let totalXP = baseXP + bonusXP + questXP + challengeXP

        // For Duos/Lobbies, totalXP should be 0 here as reward is handled on finalization.
        if (challengeData?.groupType && challengeData?.groupType !== 'solo') {
            totalXP = 0;
        }


        console.log("[XPManager] XP Calculation Summary:", {
            type: typeConfig.type,
            isNonChallengeQuest,
            baseXP,
            bonusXP,
            questXP,
            questCompleted,
            challengeXP,
            challengeCompleted,
            totalXP
        })

        return {
            baseXP,
            bonusXP,
            questXP,
            challengeXP,
            totalXP,
            questCompleted,
            challengeCompleted,
            achievedValue,
        }
    }

    static calculateQuestXP(stats, questData, isStrengthActivity) {
        if (!questData) {
            return { xp: 0, completed: false, achievedValue: 0 }
        }

        console.log("[XPManager] Calculating quest XP for:", questData.title)

        const sessionStats = { ...stats }

        // Ensure required stats are present
        if (questData.unit === "distance") {
            sessionStats.distance = sessionStats.distance || 0
        } else if (questData.unit === "steps") {
            sessionStats.steps = sessionStats.steps || 0
        } else if (questData.unit === "reps") {
            sessionStats.reps = sessionStats.reps || 0
        } else if (questData.unit === "duration") {
            sessionStats.duration = sessionStats.duration || 0
        }

        // Calculate progress
        const progressPercentage = QuestProgressManager.getProgressPercentage(
            questData,
            sessionStats,
            stats.calories || 0
        )

        const completed = progressPercentage >= 0.99
        const xp = completed ? (questData.xpReward || 50) : 0
        const achievedValue = QuestProgressManager.getTotalValue(questData, sessionStats, stats.calories || 0)

        console.log("[XPManager] Quest calculation result:", {
            progressPercentage,
            completed,
            xp,
            achievedValue
        })

        return { xp, completed, achievedValue }
    }

    static calculateChallengeXP(stats, challengeData, isStrengthActivity) {
        if (!challengeData) {
            return { xp: 0, completed: false }
        }

        console.log("[XPManager] Calculating challenge XP for:", challengeData.title)

        // For Duo/Lobby stake challenges, XP is awarded only upon winning (handled by finalizeTimeChallenge)
        if (challengeData.groupType !== 'solo' && challengeData.stakeXP) {
            return { xp: 0, completed: false }
        }

        // For solo or non-stake challenges, check if completed
        const progressValue = this.getProgressValueForChallenge(stats, challengeData, isStrengthActivity)
        const goal = challengeData.goal || 0
        const completed = goal > 0 && progressValue >= goal
        const xp = completed ? (challengeData.xpReward || 100) : 0

        return { xp, completed }
    }

    static getProgressValueForChallenge(stats, challengeData, isStrengthActivity) {
        const unit = challengeData.unit?.toLowerCase() || ""

        switch (unit) {
            case "reps":
                return stats.reps || 0
            case "distance":
            case "km":
                return isStrengthActivity ? 0 : (stats.distance || 0) / 1000
            case "duration":
            case "minutes":
                return (stats.duration || 0) / 60
            case "steps":
                return stats.steps || 0
            case "calories":
                return stats.calories || 0
            default:
                return 0
        }
    }

    static async handleQuestCompletion(
        transaction,
        userId,
        questData,
        typeConfig,
        xpCalculation,
        activityId,
        stats,
        isStrengthActivity,
    ) {
        try {
            console.log("[XPManager] Handling quest completion for:", questData.title)

            const questCompletionRef = doc(db, "quest_completions", `${userId}_${questData.id}_${Date.now()}`)
            const sessionStats = { ...stats }

            // Calculate achieved value
            const achievedValue = QuestProgressManager.getTotalValue(questData, sessionStats, stats.calories || 0)

            const questCompletionData = {
                questId: questData.id,
                userId,
                questTitle: questData.title,
                questDescription: questData.description,
                questGoal: questData.goal,
                questUnit: questData.unit,
                achievedValue,
                activityType: typeConfig.type,
                xpEarned: questData.xpReward || 50,
                completedAt: serverTimestamp(),
                activityId,
                isFromChallenge: typeConfig.type === ACTIVITY_TYPES.CHALLENGE,
                challengeId: typeConfig.challengeId || null,
            }

            transaction.set(questCompletionRef, questCompletionData)
            console.log("[XPManager] Quest completion record created")

            // Also update user's quest progress if needed
            if (questData.progressField) {
                const userRef = doc(db, "users", userId)
                transaction.update(userRef, {
                    [questData.progressField]: increment(achievedValue),
                    updatedAt: serverTimestamp(),
                })
            }

        } catch (error) {
            console.error("[XPManager] Error handling quest completion:", error)
            // Don't throw - quest completion is important but shouldn't fail the whole transaction
        }
    }

    static async handleChallengeProgress(
        transaction,
        userId,
        challengeData,
        challengeDoc,
        stats,
        xpCalculation,
        activityId,
        isStrengthActivity,
    ) {
        try {
            if (!challengeDoc || !challengeDoc.exists()) {
                console.warn("[XPManager] Challenge doc invalid or missing")
                return false
            }

            const challengeRef = challengeDoc.ref
            const challenge = challengeDoc.data()

            console.log("[XPManager] Handling challenge progress for:", challenge.title)

            // Prevent updates if challenge is already completed
            if (challenge.status?.global === "completed") {
                console.warn("[XPManager] Challenge already completed. Ignoring progress update.")
                return false
            }

            // Calculate progress value
            let progressValue = this.getProgressValueForChallenge(stats, challenge, isStrengthActivity);

            const currentProgress = challenge.progress?.[userId] || 0
            const newProgress = currentProgress + progressValue
            const goal = challenge.goal || 0
            const isCompletedByGoal = goal > 0 && newProgress >= goal
            const newUserStatus = isCompletedByGoal ? "completed" : "in_progress"

            console.log("[XPManager] Challenge progress update:", {
                userId,
                currentProgress,
                progressValue,
                newProgress,
                goal,
                isCompletedByGoal
            })

            // Update challenge progress
            const updatedProgressMap = { ...challenge.progress }
            updatedProgressMap[userId] = newProgress

            transaction.update(challengeRef, {
                [`progress.${userId}`]: newProgress,
                [`status.${userId}`]: newUserStatus,
                lastUpdated: serverTimestamp(),
                updatedAt: serverTimestamp(),
            })

            // Log participation
            const participationRef = doc(collection(db, "challenge_participations"))
            transaction.set(participationRef, {
                challengeId: challengeData.id,
                userId,
                activityId,
                progressValue,
                totalProgress: newProgress,
                completed: isCompletedByGoal,
                participatedAt: serverTimestamp(),
            })

            // Check for immediate finalization (duo challenges) - **ONLY FOR DUO**
            const isImmediateFinalizationType =
                challengeData.groupType === "duo" &&
                challengeData.completionRequirement === "betterthanothers" &&
                challengeData.participants?.length === 2

            if (isImmediateFinalizationType) {
                console.log("[XPManager] Checking immediate finalization criteria for duo challenge...")

                // Check if all participants have submitted (score > 0)
                if (checkAllParticipantsSubmitted({
                    ...challengeData,
                    progress: updatedProgressMap
                })) {
                    console.log("[XPManager] ✅ All participants submitted! Triggering immediate finalization...")

                    try {
                        const updatedChallengeData = {
                            ...challengeData,
                            progress: updatedProgressMap
                        }
                        // Use finalizeChallengeImmediate inside the transaction
                        await finalizeChallengeImmediate(transaction, challengeRef, updatedChallengeData)
                        console.log("[XPManager] ✅ Immediate finalization executed successfully")
                        return true // Challenge was finalized
                    } catch (finalizationError) {
                        console.error("[XPManager] Error during immediate finalization:", finalizationError)
                        return false
                    }
                } else {
                    console.log("[XPManager] Not all participants have submitted yet. Waiting...")
                }
            }

            // Check for solo challenge completion (goal-based)
            if (challengeData.groupType === 'solo' && isCompletedByGoal) {
                // For solo, the reward is already included in the initial XP calculation,
                // but we mark the challenge as completed globally
                transaction.update(challengeRef, {
                    'status.global': 'completed',
                    winnerId: userId,
                    updatedAt: serverTimestamp(),
                });
                return true;
            }

            return false // Challenge was NOT finalized

        } catch (error) {
            console.error("[XPManager] Error handling challenge progress:", error)
            return false
        }
    }

    static updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation) {
        switch (typeConfig.type) {
            case ACTIVITY_TYPES.CHALLENGE:
                userUpdateData.totalChallengeActivities = increment(1)
                if (xpCalculation.challengeCompleted) {
                    userUpdateData.completedChallenges = increment(1)
                }
                break
            case ACTIVITY_TYPES.QUEST:
                userUpdateData.totalQuestActivities = increment(1)
                if (xpCalculation.questCompleted) {
                    userUpdateData.completedQuests = increment(1)
                }
                break
            default:
                userUpdateData.totalNormalActivities = increment(1)
        }
    }

    static checkActivityCompletion(stats, isStrengthActivity, challengeData = null) {
        const isTimeChallenge = challengeData?.mode === 'time' || challengeData?.unit === 'duration';

        if (isStrengthActivity) {
            if ((stats.reps || 0) < 1) {
                return { isComplete: false, reason: "Minimum 1 repetition required" };
            }
        } else if (isTimeChallenge) {
            if ((stats.duration || 0) < 10) {
                return { isComplete: false, reason: "Minimum 10 seconds required" };
            }
        } else {
            const distanceInKm = (stats.distance || 0) / 1000;
            if (distanceInKm < 0.01) {
                return { isComplete: false, reason: "Minimum 0.01 km (10 meters) required" };
            }
            if ((stats.duration || 0) < 10) {
                return { isComplete: false, reason: "Minimum 10 seconds required" };
            }
        }

        return { isComplete: true };
    }


    static calculatePerformanceBonusXP(stats, isStrengthActivity) {
        let bonusXP = 0

        if (isStrengthActivity) {
            // Bonus for reps: 1 XP per 5 reps
            bonusXP += Math.floor((stats.reps || 0) / 5) * 1

            // Bonus for duration: 1 XP per 2 minutes
            bonusXP += Math.floor((stats.duration || 0) / 120) * 1
        } else {
            // Bonus for distance: 1 XP per 0.5 km
            const km = (stats.distance || 0) / 1000
            bonusXP += Math.floor(km / 0.5) * 1

            // Bonus for duration: 1 XP per 5 minutes
            bonusXP += Math.floor((stats.duration || 0) / 300) * 1

            // Bonus for steps: 1 XP per 500 steps
            bonusXP += Math.floor((stats.steps || 0) / 500) * 1
        }

        // Cap bonus XP at 50
        return Math.min(bonusXP, 50)
    }

    static generateActivityId(userId, sessionStartTime, activityType = "normal") {
        return `${userId}_${sessionStartTime}_${activityType}_${Math.random().toString(36).substr(2, 9)}`
    }
}

export default XPManager