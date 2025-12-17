// xpManager.js
import { doc, runTransaction, serverTimestamp, collection } from "firebase/firestore"
import { db } from "../firebaseConfig"
import { ActivityTypeManager, ACTIVITY_TYPES } from "./ActivityTypeManager"
import { QuestProgressManager } from "./QuestProgressManager"
import { increment } from "firebase/firestore"

export class XPManager {
    /**
     * Main method to award XP for activities and handle all related progress
     */
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
        console.log("[v1] XPManager: Starting XP award process for activity:", activityId)

        try {
            return await runTransaction(db, async (transaction) => {
                // 🧾 Prevent double XP (idempotency)
                const receiptRef = doc(db, "activity_receipts", activityId)
                const receiptDoc = await transaction.get(receiptRef)

                if (receiptDoc.exists()) {
                    console.log("[XPManager] XP already awarded for this activity")
                    return {
                        success: true,
                        alreadyAwarded: true,
                        xpEarned: receiptDoc.data().xpEarned,
                        questCompleted: receiptDoc.data().questCompleted || false,
                        challengeCompleted: receiptDoc.data().challengeCompleted || false,
                    }
                }

                // 👤 Fetch user
                const userRef = doc(db, "users", userId)
                const userDoc = await transaction.get(userRef)
                if (!userDoc.exists()) throw new Error("User document not found")

                const userData = userDoc.data()

                // ✅ Check activity meets minimum requirement
                const completionCheck = this.checkActivityCompletion(stats, isStrengthActivity)
                if (!completionCheck.isComplete) {
                    console.log("[XPManager] Activity failed completion criteria:", completionCheck.reason)
                    return {
                        success: false,
                        reason: completionCheck.reason,
                        xpEarned: 0,
                        questCompleted: false,
                        challengeCompleted: false,
                    }
                }

                // ⚙️ Determine activity type
                const typeConfig = ActivityTypeManager.determineActivityType(activityParams)

                // 💥 Calculate XP
                const xpCalculation = this.calculateXPByType(
                    stats,
                    typeConfig,
                    questData,
                    challengeData,
                    isStrengthActivity
                )

                // 🚫 Prevent XP for incomplete quests
                if (typeConfig.type === ACTIVITY_TYPES.QUEST && !xpCalculation.questCompleted) {
                    console.log("[XPManager] Quest not completed — XP locked.")
                    return {
                        success: true,
                        xpEarned: 0,
                        questCompleted: false,
                        challengeCompleted: false,
                        levelUp: false,
                        reason: "Quest in progress – XP locked until completion.",
                    }
                }

                // 🧮 Compute XP and Level
                const currentXP = userData.totalXP || 0
                const currentLevel = userData.level || 1
                const newTotalXP = currentXP + xpCalculation.totalXP
                const newLevel = Math.floor(newTotalXP / 1000) + 1

                const userUpdateData = {
                    totalXP: newTotalXP,
                    level: newLevel,
                    lastActivityDate: serverTimestamp(),
                    totalActivities: (userData.totalActivities || 0) + 1,
                }

                // 🏋️ Update user stats
                if (isStrengthActivity) {
                    userUpdateData.totalReps = (userData.totalReps || 0) + (stats.reps || 0)
                    userUpdateData.totalStrengthDuration = (userData.totalStrengthDuration || 0) + (stats.duration || 0)
                } else {
                    const distanceInKm = (stats.distance || 0) / 1000
                    userUpdateData.totalDistance = (userData.totalDistance || 0) + distanceInKm
                    userUpdateData.totalSteps = (userData.totalSteps || 0) + (stats.steps || 0)
                    userUpdateData.totalDuration = (userData.totalDuration || 0) + (stats.duration || 0)
                }

                // 🧩 Type-specific stats
                this.updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation)

                transaction.update(userRef, userUpdateData)

                // 💾 Save full activity record
                const completeActivityData = ActivityTypeManager.buildActivityData(
                    activityData,
                    typeConfig,
                    questData,
                    challengeData
                )

                completeActivityData.xpEarned = xpCalculation.totalXP
                completeActivityData.bonusXP = xpCalculation.bonusXP
                completeActivityData.questCompleted = xpCalculation.questCompleted
                completeActivityData.challengeCompleted = xpCalculation.challengeCompleted

                const collectionName = ActivityTypeManager.getStorageCollection(typeConfig.type)
                const activityRef = doc(db, collectionName, activityId)
                transaction.set(activityRef, completeActivityData)

                // 🏁 Quest completion
                if (xpCalculation.questCompleted && questData) {
                    await this.handleQuestCompletion(
                        transaction,
                        userId,
                        questData,
                        typeConfig,
                        xpCalculation,
                        activityId,
                        stats,
                        isStrengthActivity
                    )
                }

                // 🏆 Challenge progress
                if (challengeData) {
                    await this.handleChallengeProgress(
                        transaction,
                        userId,
                        challengeData,
                        stats,
                        xpCalculation,
                        activityId,
                        isStrengthActivity
                    )
                }

                // 🧾 Record XP receipt
                const receiptData = {
                    userId,
                    activityId,
                    activityType: typeConfig.type,
                    xpEarned: xpCalculation.totalXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    awardedAt: serverTimestamp(),
                }
                transaction.set(receiptRef, receiptData)

                console.log("[XPManager] XP awarded successfully:", {
                    activityType: typeConfig.type,
                    totalXP: xpCalculation.totalXP,
                    newLevel,
                    levelUp: newLevel > currentLevel,
                })

                return {
                    success: true,
                    alreadyAwarded: false,
                    activityType: typeConfig.type,
                    xpEarned: xpCalculation.totalXP,
                    questCompleted: xpCalculation.questCompleted,
                    challengeCompleted: xpCalculation.challengeCompleted,
                    levelUp: newLevel > currentLevel,
                    newLevel,
                    bonusXP: xpCalculation.bonusXP,
                }
            })
        } catch (error) {
            console.error("[XPManager] Error awarding XP:", error)
            throw error
        }
    }

    /**
     * Calculate XP per type (Fixed: XP only given on quest completion)
     */
    static calculateXPByType(stats, typeConfig, questData, challengeData, isStrengthActivity) {
        const baseXP = 50
        let bonusXP = this.calculatePerformanceBonusXP(stats, isStrengthActivity)
        let questXP = 0
        let challengeXP = 0
        let questCompleted = false
        let challengeCompleted = false
        let achievedValue = 0

        if (questData) {
            const questResult = this.calculateQuestXP(stats, questData, isStrengthActivity)
            questXP = questResult.xp
            questCompleted = questResult.completed
            achievedValue = questResult.achievedValue
        }

        if (challengeData) {
            const challengeResult = this.calculateChallengeXP(stats, challengeData, isStrengthActivity)
            challengeXP = challengeResult.xp
            challengeCompleted = challengeResult.completed
        }

        // ✅ Only award XP if quest is completed
        let totalXP = 0
        if (typeConfig.type === ACTIVITY_TYPES.QUEST) {
            totalXP = questCompleted ? baseXP + bonusXP + questXP + challengeXP : 0
        } else {
            totalXP = baseXP + bonusXP + questXP + challengeXP
        }

        console.log("[XPManager] XP Calculation Summary:", {
            type: typeConfig.type,
            questCompleted,
            totalXP,
            baseXP,
            bonusXP,
            questXP,
            challengeXP,
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

    /**
     * Quest XP calculation
     */
    static calculateQuestXP(stats, questData, isStrengthActivity) {
        if (!questData) return { xp: 0, completed: false, achievedValue: 0 }

        const sessionStats = { ...stats }
        if (questData.unit === "distance") sessionStats.distance = sessionStats.distance || 0

        const progressPercentage = QuestProgressManager.getProgressPercentage(
            questData,
            sessionStats,
            stats.calories || 0
        )

        const completed = progressPercentage >= 0.99
        const xp = completed ? questData.xpReward || 0 : 0
        const achievedValue = QuestProgressManager.getTotalValue(questData, sessionStats, stats.calories || 0)

        return { xp, completed, achievedValue }
    }

    /**
     * Challenge XP calculation
     */
    static calculateChallengeXP(stats, challengeData, isStrengthActivity) {
        if (!challengeData) return { xp: 0, completed: false }

        if (challengeData.stakeXP) {
            return { xp: 0, completed: false } // XP comes from stake distribution
        } else {
            return { xp: challengeData.xpReward || 100, completed: false }
        }
    }

    /**
     * Handle quest completion
     */
    static async handleQuestCompletion(transaction, userId, questData, typeConfig, xpCalculation, activityId, stats, isStrengthActivity) {
        const questCompletionRef = doc(db, "quest_completions", `${userId}_${questData.id}_${Date.now()}`)

        const sessionStats = { ...stats }
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
            xpEarned: questData.xpReward || 0,
            completedAt: serverTimestamp(),
            activityId,
            isFromChallenge: typeConfig.type === ACTIVITY_TYPES.CHALLENGE,
            challengeId: typeConfig.challengeId || null,
        }
        transaction.set(questCompletionRef, questCompletionData)
    }

    /**
     * Challenge progress tracking
     */
    static async handleChallengeProgress(transaction, userId, challengeData, stats, xpCalculation, activityId, isStrengthActivity) {
        const challengeRef = doc(db, "challenges", challengeData.id)
        const challengeDoc = await transaction.get(challengeRef)
        if (!challengeDoc.exists()) {
            console.warn("[XPManager] Challenge not found:", challengeData.id)
            return
        }

        const challenge = challengeDoc.data()
        const updatedProgress = { ...challenge.progress }
        const updatedStatus = { ...challenge.status }

        let progressValue = 0
        if (challenge.unit === "reps" && isStrengthActivity) progressValue = stats.reps || 0
        else if (challenge.unit === "distance" && !isStrengthActivity) progressValue = (stats.distance || 0) / 1000
        else if (challenge.unit === "duration") progressValue = (stats.duration || 0) / 60
        else if (challenge.unit === "steps" && !isStrengthActivity) progressValue = stats.steps || 0
        else if (challenge.unit === "calories") progressValue = stats.calories || 0

        const currentProgress = updatedProgress[userId] || 0
        const newProgress = currentProgress + progressValue
        updatedProgress[userId] = newProgress

        const isCompleted = challenge.goal > 0 && newProgress >= challenge.goal
        if (isCompleted) {
            updatedStatus[userId] = "completed"
            await this.distributeChallengeRewards(transaction, userId, challengeData, challenge)
        } else {
            updatedStatus[userId] = "in_progress"
        }

        transaction.update(challengeRef, {
            progress: updatedProgress,
            status: updatedStatus,
            lastUpdated: serverTimestamp(),
        })

        const participationRef = doc(collection(db, "challenge_participations"))
        transaction.set(participationRef, {
            challengeId: challengeData.id,
            userId,
            activityId,
            progressValue,
            totalProgress: newProgress,
            completed: isCompleted,
            participatedAt: serverTimestamp(),
        })
    }

    /**
     * Distribute challenge rewards
     */
    static async distributeChallengeRewards(transaction, userId, challengeData, challenge) {
        const participants = Object.keys(challenge.progress || {})
        const totalStakeXP = (challenge.stakeXP || 100) * participants.length

        const winnerRef = doc(db, "users", userId)
        transaction.update(winnerRef, {
            totalXP: increment(totalStakeXP),
            completedChallenges: increment(1),
        })

        const rewardRef = doc(collection(db, "challenge_rewards"))
        transaction.set(rewardRef, {
            challengeId: challengeData.id,
            winnerId: userId,
            stakeXP: challenge.stakeXP || 100,
            totalReward: totalStakeXP,
            distributedAt: serverTimestamp(),
        })
    }

    /**
     * Update user stats based on activity type
     */
    static updateTypeSpecificStats(userUpdateData, typeConfig, xpCalculation) {
        switch (typeConfig.type) {
            case ACTIVITY_TYPES.CHALLENGE:
                userUpdateData.totalChallengeActivities = (userUpdateData.totalChallengeActivities || 0) + 1
                if (xpCalculation.challengeCompleted)
                    userUpdateData.completedChallenges = (userUpdateData.completedChallenges || 0) + 1
                break
            case ACTIVITY_TYPES.QUEST:
                userUpdateData.totalQuestActivities = (userUpdateData.totalQuestActivities || 0) + 1
                if (xpCalculation.questCompleted)
                    userUpdateData.completedQuests = (userUpdateData.completedQuests || 0) + 1
                break
            default:
                userUpdateData.totalNormalActivities = (userUpdateData.totalNormalActivities || 0) + 1
        }
    }

    /**
     * Validate completion criteria
     */
    static checkActivityCompletion(stats, isStrengthActivity) {
        if (isStrengthActivity) {
            if ((stats.reps || 0) < 5)
                return { isComplete: false, reason: "Minimum 5 repetitions required" }
        } else {
            const distanceInKm = (stats.distance || 0) / 1000
            if (distanceInKm < 0.1) return { isComplete: false, reason: "Minimum 0.1 km required" }
            if ((stats.duration || 0) < 60) return { isComplete: false, reason: "Minimum 1 minute required" }
        }
        return { isComplete: true }
    }

    /**
     * Performance XP (based on stats)
     */
    static calculatePerformanceBonusXP(stats, isStrengthActivity) {
        let bonusXP = 0
        if (isStrengthActivity) {
            bonusXP += Math.floor((stats.reps || 0) / 10) * 5
            bonusXP += Math.floor((stats.duration || 0) / 300) * 10
        } else {
            const km = (stats.distance || 0) / 1000
            bonusXP += Math.floor(km) * 10
            bonusXP += Math.floor((stats.duration || 0) / 600) * 5
            bonusXP += Math.floor((stats.steps || 0) / 1000) * 2
        }
        return bonusXP
    }

    /**
     * Generate unique ID for activity
     */
    static generateActivityId(userId, sessionStartTime, activityType = "normal") {
        return `${userId}_${sessionStartTime}_${activityType}`
    }
}

export default XPManager
