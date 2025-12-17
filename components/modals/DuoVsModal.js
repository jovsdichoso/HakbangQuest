"use client"

import { useState, useEffect, useRef } from "react"
import { Modal, View, Image, Animated, Easing, StyleSheet } from "react-native"
import CustomText from "../CustomText"
import Ionicons from "react-native-vector-icons/Ionicons"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../../firebaseConfig"

const DEFAULT_AVATAR = "https://res.cloudinary.com/dljywnlvh/image/upload/v1747077348/default-avatar_jkbpwv.jpg"

const DuoVsModal = ({
    visible,
    player1,
    player2,
    stakeXP,
    challengeId,
    fullChallenge,
    onClose,
    navigateToActivityWithChallenge,
}) => {
    const [animationStage, setAnimationStage] = useState(0)
    const [actualPrizePool, setActualPrizePool] = useState(stakeXP || 0)
    const [actualPlayer1, setActualPlayer1] = useState(player1 || {})
    const [actualPlayer2, setActualPlayer2] = useState(player2 || {})
    const [isLoading, setIsLoading] = useState(false)

    // Animation refs
    const fadeAnim = useRef(new Animated.Value(0)).current
    const scaleAnim = useRef(new Animated.Value(0.8)).current
    const player1XAnim = useRef(new Animated.Value(-100)).current
    const player2XAnim = useRef(new Animated.Value(100)).current
    const vsScaleAnim = useRef(new Animated.Value(0)).current
    const vsRotateAnim = useRef(new Animated.Value(0)).current
    const lightningAnim = useRef(new Animated.Value(0)).current
    const pulseAnim = useRef(new Animated.Value(1)).current
    const stakeGlowAnim = useRef(new Animated.Value(0)).current
    const prizePoolScaleAnim = useRef(new Animated.Value(0.8)).current
    const prizePoolGlowAnim = useRef(new Animated.Value(0)).current
    const sparkleAnims = useRef([...Array(6)].map(() => new Animated.Value(0))).current

    const individualStake = Math.round((actualPrizePool / 2) * 10) / 10

    // Enhanced update player data when props change
    useEffect(() => {
        if (player1 && (player1.displayName || player1.username || player1.name)) {
            setActualPlayer1(prevPlayer => ({
                ...prevPlayer,
                ...player1,
                displayName: player1.displayName || player1.username || player1.name || prevPlayer.displayName,
                avatar: player1.avatar || player1.photoURL || prevPlayer.avatar || DEFAULT_AVATAR
            }))
        }

        if (player2 && (player2.displayName || player2.username || player2.name)) {
            setActualPlayer2(prevPlayer => ({
                ...prevPlayer,
                ...player2,
                displayName: player2.displayName || player2.username || player2.name || prevPlayer.displayName,
                avatar: player2.avatar || player2.photoURL || prevPlayer.avatar || DEFAULT_AVATAR
            }))
        }

        if (stakeXP !== undefined && stakeXP !== null && stakeXP > 0) {
            setActualPrizePool(stakeXP)
        }
    }, [player1, player2, stakeXP])

    // Enhanced fetch challenge data
    useEffect(() => {
        const fetchChallengeData = async () => {
            if (!challengeId) {
                console.warn('DuoVsModal: No challengeId provided')
                return
            }

            setIsLoading(true)

            try {
                const challengeRef = doc(db, "challenges", challengeId)
                const challengeSnap = await getDoc(challengeRef)

                if (challengeSnap.exists()) {
                    const challengeData = challengeSnap.data()
                    console.log('DuoVsModal: Fetched challenge data:', challengeData)

                    if (challengeData.stakeXP && challengeData.stakeXP !== actualPrizePool) {
                        setActualPrizePool(challengeData.stakeXP)
                    }

                    const needPlayer1 = !actualPlayer1?.displayName && !actualPlayer1?.username
                    const needPlayer2 = !actualPlayer2?.displayName && !actualPlayer2?.username

                    if (needPlayer1 || needPlayer2) {
                        const participants = challengeData.participants || []
                        const creatorId = challengeData.createdBy
                        const opponentId = participants.find((p) => p !== creatorId)

                        console.log('DuoVsModal: Creator ID:', creatorId, 'Opponent ID:', opponentId)

                        const fetchPromises = []

                        if (needPlayer1 && creatorId) {
                            fetchPromises.push(
                                getDoc(doc(db, "users", creatorId)).then(snap => {
                                    if (snap.exists()) {
                                        const userData = snap.data()
                                        console.log('DuoVsModal: Player1 data fetched:', userData)
                                        return {
                                            type: 'player1',
                                            data: {
                                                id: creatorId,
                                                displayName: userData.displayName || userData.username || userData.name || 'Player 1',
                                                avatar: userData.avatar || userData.photoURL || DEFAULT_AVATAR,
                                                challengeId: challengeId,
                                                ...userData
                                            }
                                        }
                                    }
                                    return { type: 'player1', data: null }
                                }).catch(error => {
                                    console.error('Error fetching player1:', error)
                                    return { type: 'player1', data: null }
                                })
                            )
                        }

                        if (needPlayer2 && opponentId) {
                            fetchPromises.push(
                                getDoc(doc(db, "users", opponentId)).then(snap => {
                                    if (snap.exists()) {
                                        const userData = snap.data()
                                        console.log('DuoVsModal: Player2 data fetched:', userData)
                                        return {
                                            type: 'player2',
                                            data: {
                                                id: opponentId,
                                                displayName: userData.displayName || userData.username || userData.name || 'Player 2',
                                                avatar: userData.avatar || userData.photoURL || DEFAULT_AVATAR,
                                                challengeId: challengeId,
                                                ...userData
                                            }
                                        }
                                    }
                                    return { type: 'player2', data: null }
                                }).catch(error => {
                                    console.error('Error fetching player2:', error)
                                    return { type: 'player2', data: null }
                                })
                            )
                        }

                        if (fetchPromises.length > 0) {
                            const results = await Promise.all(fetchPromises)

                            results.forEach(result => {
                                if (result.data) {
                                    if (result.type === 'player1') {
                                        setActualPlayer1(result.data)
                                    } else if (result.type === 'player2') {
                                        setActualPlayer2(result.data)
                                    }
                                }
                            })
                        }
                    }
                } else {
                    console.warn('DuoVsModal: Challenge document not found:', challengeId)
                }
            } catch (error) {
                console.error("DuoVsModal: Error fetching challenge data:", error)
            } finally {
                setIsLoading(false)
            }
        }

        if (visible) {
            const needsFetch =
                !actualPrizePool ||
                (!actualPlayer1?.displayName && !actualPlayer1?.username) ||
                (!actualPlayer2?.displayName && !actualPlayer2?.username)

            console.log('DuoVsModal: Needs fetch?', needsFetch, {
                challengeId,
                actualPrizePool,
                player1HasName: !!(actualPlayer1?.displayName || actualPlayer1?.username),
                player2HasName: !!(actualPlayer2?.displayName || actualPlayer2?.username)
            })

            if (needsFetch && challengeId) {
                fetchChallengeData()
            } else {
                startAnimationSequence()
            }
        } else {
            resetAnimations()
        }
    }, [visible, challengeId, actualPrizePool, actualPlayer1?.displayName, actualPlayer1?.username, actualPlayer2?.displayName, actualPlayer2?.username])

    const resetAnimations = () => {
        setAnimationStage(0)
        fadeAnim.setValue(0)
        scaleAnim.setValue(0.8)
        player1XAnim.setValue(-100)
        player2XAnim.setValue(100)
        vsScaleAnim.setValue(0)
        vsRotateAnim.setValue(0)
        lightningAnim.setValue(0)
        pulseAnim.setValue(1)
        stakeGlowAnim.setValue(0)
        prizePoolScaleAnim.setValue(0.8)
        prizePoolGlowAnim.setValue(0)
        sparkleAnims.forEach((anim) => anim.setValue(0))
    }

    const startAnimationSequence = () => {
        console.log('DuoVsModal: Starting animation sequence')
        setAnimationStage(0)
        resetAnimations()

        // Stage 0: Fade in and scale modal (0-500ms)
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
            }),
        ]).start()

        // Stage 1: Players slide in (500ms)
        setTimeout(() => {
            setAnimationStage(1)
            Animated.parallel([
                Animated.spring(player1XAnim, {
                    toValue: 0,
                    tension: 40,
                    friction: 8,
                    useNativeDriver: true,
                }),
                Animated.spring(player2XAnim, {
                    toValue: 0,
                    tension: 40,
                    friction: 8,
                    useNativeDriver: true,
                }),
            ]).start()
        }, 500)

        // Stage 2: VS appears with rotation and lightning (1200ms)
        setTimeout(() => {
            setAnimationStage(2)
            Animated.parallel([
                Animated.spring(vsScaleAnim, {
                    toValue: 1,
                    tension: 100,
                    friction: 5,
                    useNativeDriver: true,
                }),
                Animated.timing(vsRotateAnim, {
                    toValue: 1,
                    duration: 600,
                    easing: Easing.out(Easing.back(1.5)),
                    useNativeDriver: true,
                }),
                Animated.sequence([
                    Animated.timing(lightningAnim, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                    Animated.timing(lightningAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                ]),
            ]).start()

            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 800,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ]),
            ).start()
        }, 1200)

        // Stage 3: Stakes deduction animation (2000ms)
        setTimeout(() => {
            setAnimationStage(3)
            Animated.parallel([
                Animated.sequence([
                    Animated.timing(stakeGlowAnim, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                    Animated.timing(stakeGlowAnim, {
                        toValue: 0,
                        duration: 400,
                        useNativeDriver: true,
                    }),
                ]),
                Animated.stagger(
                    100,
                    sparkleAnims.map((anim) =>
                        Animated.sequence([
                            Animated.timing(anim, {
                                toValue: 1,
                                duration: 600,
                                useNativeDriver: true,
                            }),
                            Animated.timing(anim, {
                                toValue: 0,
                                duration: 400,
                                useNativeDriver: true,
                            }),
                        ]),
                    ),
                ),
            ]).start()
        }, 2000)

        // Stage 4: Prize pool reveal (3000ms)
        setTimeout(() => {
            setAnimationStage(4)
            Animated.parallel([
                Animated.spring(prizePoolScaleAnim, {
                    toValue: 1,
                    tension: 60,
                    friction: 6,
                    useNativeDriver: true,
                }),
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(prizePoolGlowAnim, {
                            toValue: 1,
                            duration: 1000,
                            easing: Easing.inOut(Easing.ease),
                            useNativeDriver: true,
                        }),
                        Animated.timing(prizePoolGlowAnim, {
                            toValue: 0,
                            duration: 1000,
                            easing: Easing.inOut(Easing.ease),
                            useNativeDriver: true,
                        }),
                    ]),
                ).start(),
            ]).start()
        }, 3000)

        // Stage 5: Final message (3800ms)
        setTimeout(() => {
            setAnimationStage(5);

            setTimeout(() => {
                if (onClose) onClose();

                if (typeof navigateToActivityWithChallenge === "function") {
                    (async () => {
                        try {
                            const challengeRef = doc(db, "challenges", challengeId);
                            const snap = await getDoc(challengeRef);
                            if (snap.exists()) {
                                const fullChallenge = { id: snap.id, ...snap.data() };
                                console.log("Navigating to ActivityScreen with challenge:", fullChallenge);
                                navigateToActivityWithChallenge(fullChallenge, true);
                            } else {
                                console.warn("DuoVsModal: Challenge not found for ID", challengeId);
                            }
                        } catch (error) {
                            console.error("DuoVsModal navigation error:", error);
                        }
                    })();
                }
            }, 1500);
        }, 3800);
    }

    const vsRotation = vsRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0deg", "360deg"],
    })

    const lightningOpacity = lightningAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 1, 0],
    })

    const stakeGlowOpacity = stakeGlowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.6, 1],
    })

    const prizePoolGlow = prizePoolGlowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.7, 1],
    })

    const getDisplayName = (player) => {
        if (!player) return "Loading..."
        return player.displayName || player.username || player.name || "Player"
    }

    const getAvatar = (player) => {
        if (!player) return DEFAULT_AVATAR
        return player.avatar || player.photoURL || DEFAULT_AVATAR
    }

    if (!visible) return null

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
            <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                {/* Radial gradient glow effect */}
                <Animated.View
                    style={[styles.backgroundGlow, { opacity: animationStage >= 2 ? 0.15 : 0 }]}
                />

                <Animated.View
                    style={[styles.modalContainer, { transform: [{ scale: scaleAnim }] }]}
                >
                    {/* Top accent line */}
                    <View style={styles.topAccent} />

                    {/* Title */}
                    <View style={styles.titleContainer}>
                        <CustomText weight="bold" style={styles.title}>
                            {animationStage < 5 ? "CHALLENGE STARTING!" : "LET THE BATTLE BEGIN! 🔥"}
                        </CustomText>
                        <View style={styles.titleUnderline} />
                    </View>

                    {/* Players Container */}
                    <View style={styles.playersContainer}>
                        {/* Player 1 */}
                        <Animated.View
                            style={[styles.playerSection, { transform: [{ translateX: player1XAnim }] }]}
                        >
                            {/* Sparkles for Player 1 */}
                            {sparkleAnims.slice(0, 3).map((anim, i) => (
                                <Animated.View
                                    key={i}
                                    style={[
                                        styles.sparkle,
                                        {
                                            opacity: anim,
                                            top: [15, 35, 55][i],
                                            left: [5, 25, 45][i],
                                            transform: [{ scale: anim }]
                                        },
                                    ]}
                                >
                                    <Ionicons name="sparkles" size={14} color="#FFD700" />
                                </Animated.View>
                            ))}

                            <View style={styles.avatarContainer}>
                                <View style={[styles.avatarRing, styles.player1Ring]}>
                                    <View
                                        style={[
                                            styles.avatar,
                                            animationStage >= 3 && styles.avatarGlowActive,
                                        ]}
                                    >
                                        <Image
                                            source={{ uri: getAvatar(actualPlayer1) }}
                                            style={styles.avatarImage}
                                            defaultSource={{ uri: DEFAULT_AVATAR }}
                                        />
                                    </View>
                                </View>
                                {animationStage >= 3 && (
                                    <View style={[styles.statusBadge, styles.player1Badge]}>
                                        <Ionicons name="checkmark-circle" size={12} color="#fff" style={{ marginRight: 4 }} />
                                        <CustomText weight="bold" style={styles.statusBadgeText}>
                                            STAKED
                                        </CustomText>
                                    </View>
                                )}
                            </View>

                            <CustomText weight="bold" style={styles.playerName} numberOfLines={1}>
                                {getDisplayName(actualPlayer1)}
                            </CustomText>

                            {animationStage >= 3 && (
                                <Animated.View style={[styles.stakeCard, { opacity: stakeGlowOpacity }]}>
                                    <View style={styles.stakeIconContainer}>
                                        <Ionicons name="flame" size={16} color="#FF6B6B" />
                                    </View>
                                    <View>
                                        <CustomText style={styles.stakeLabel}>Wagered</CustomText>
                                        <CustomText weight="bold" style={styles.stakeAmount}>
                                            {individualStake} XP
                                        </CustomText>
                                    </View>
                                </Animated.View>
                            )}
                        </Animated.View>

                        {/* VS Section */}
                        <View style={styles.vsSection}>
                            {/* Lightning Effect */}
                            <Animated.View
                                style={[
                                    styles.lightningEffect,
                                    {
                                        opacity: lightningOpacity,
                                    },
                                ]}
                            >
                                <View style={styles.lightningInner} />
                            </Animated.View>

                            <Animated.View
                                style={[
                                    styles.vsBadge,
                                    {
                                        transform: [
                                            { scale: vsScaleAnim },
                                            { rotate: vsRotation },
                                            { scale: pulseAnim }
                                        ]
                                    },
                                ]}
                            >
                                <View style={styles.vsInner}>
                                    <CustomText weight="black" style={styles.vsText}>
                                        VS
                                    </CustomText>
                                </View>
                            </Animated.View>

                            {/* Energy bolts */}
                            {animationStage >= 2 && (
                                <>
                                    <View style={[styles.energyBolt, styles.energyBoltLeft]} />
                                    <View style={[styles.energyBolt, styles.energyBoltRight]} />
                                </>
                            )}
                        </View>

                        {/* Player 2 */}
                        <Animated.View
                            style={[styles.playerSection, { transform: [{ translateX: player2XAnim }] }]}
                        >
                            {/* Sparkles for Player 2 */}
                            {sparkleAnims.slice(3, 6).map((anim, i) => (
                                <Animated.View
                                    key={i}
                                    style={[
                                        styles.sparkle,
                                        {
                                            opacity: anim,
                                            top: [15, 35, 55][i],
                                            right: [5, 25, 45][i],
                                            transform: [{ scale: anim }]
                                        },
                                    ]}
                                >
                                    <Ionicons name="sparkles" size={14} color="#FFD700" />
                                </Animated.View>
                            ))}

                            <View style={styles.avatarContainer}>
                                <View style={[styles.avatarRing, styles.player2Ring]}>
                                    <View
                                        style={[
                                            styles.avatar,
                                            animationStage >= 3 && styles.avatarGlowActive,
                                        ]}
                                    >
                                        <Image
                                            source={{ uri: getAvatar(actualPlayer2) }}
                                            style={styles.avatarImage}
                                            defaultSource={{ uri: DEFAULT_AVATAR }}
                                        />
                                    </View>
                                </View>
                                {animationStage >= 3 && (
                                    <View style={[styles.statusBadge, styles.player2Badge]}>
                                        <Ionicons name="checkmark-circle" size={12} color="#fff" style={{ marginRight: 4 }} />
                                        <CustomText weight="bold" style={styles.statusBadgeText}>
                                            STAKED
                                        </CustomText>
                                    </View>
                                )}
                            </View>

                            <CustomText weight="bold" style={styles.playerName} numberOfLines={1}>
                                {getDisplayName(actualPlayer2)}
                            </CustomText>

                            {animationStage >= 3 && (
                                <Animated.View style={[styles.stakeCard, { opacity: stakeGlowOpacity }]}>
                                    <View style={styles.stakeIconContainer}>
                                        <Ionicons name="flame" size={16} color="#FF6B6B" />
                                    </View>
                                    <View>
                                        <CustomText style={styles.stakeLabel}>Wagered</CustomText>
                                        <CustomText weight="bold" style={styles.stakeAmount}>
                                            {individualStake} XP
                                        </CustomText>
                                    </View>
                                </Animated.View>
                            )}
                        </Animated.View>
                    </View>

                    {/* Prize Pool */}
                    {animationStage >= 4 && (
                        <Animated.View
                            style={[
                                styles.prizePoolCard,
                                {
                                    transform: [{ scale: prizePoolScaleAnim }],
                                    opacity: prizePoolGlow
                                },
                            ]}
                        >
                            <View style={styles.prizePoolBg} />

                            <View style={styles.prizePoolContent}>
                                <View style={styles.prizePoolHeader}>
                                    <Ionicons name="trophy" size={24} color="#FFD700" />
                                    <CustomText weight="bold" style={styles.prizePoolTitle}>
                                        WINNER TAKES ALL
                                    </CustomText>
                                    <Ionicons name="trophy" size={24} color="#FFD700" />
                                </View>

                                <View style={styles.prizePoolAmountContainer}>
                                    <CustomText weight="black" style={styles.prizePoolAmount}>
                                        {actualPrizePool}
                                    </CustomText>
                                    <CustomText weight="semibold" style={styles.prizePoolXP}>
                                        XP
                                    </CustomText>
                                </View>

                                <View style={styles.prizePoolDivider} />

                                <CustomText style={styles.prizePoolSubtext}>
                                    Total Prize Pool
                                </CustomText>
                            </View>
                        </Animated.View>
                    )}

                    {/* Success Message */}
                    {animationStage >= 5 && (
                        <View style={styles.successCard}>
                            <View style={styles.successIcon}>
                                <Ionicons name="shield-checkmark" size={24} color="#10B981" />
                            </View>
                            <CustomText weight="bold" style={styles.successText}>
                                Challenge Activated!
                            </CustomText>
                            <CustomText style={styles.successSubtext}>
                                Stakes have been locked. May the best player win! 🏆
                            </CustomText>
                        </View>
                    )}

                    {/* Bottom accent */}
                    <View style={styles.bottomAccent} />
                </Animated.View>
            </Animated.View>
        </Modal>
    )
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.96)",
        justifyContent: "center",
        alignItems: "center",
    },
    backgroundGlow: {
        position: "absolute",
        top: "30%",
        left: "10%",
        right: "10%",
        height: "40%",
        backgroundColor: "#6366F1",
        borderRadius: 999,
        opacity: 0.15,
        transform: [{ scaleX: 1.5 }],
    },
    modalContainer: {
        backgroundColor: "#0F172A",
        borderRadius: 28,
        padding: 28,
        width: "92%",
        maxWidth: 480,
        borderWidth: 1,
        borderColor: "rgba(99, 102, 241, 0.3)",
        shadowColor: "#6366F1",
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.4,
        shadowRadius: 50,
        elevation: 25,
    },
    topAccent: {
        position: "absolute",
        top: 0,
        left: "25%",
        right: "25%",
        height: 3,
        backgroundColor: "#6366F1",
        borderBottomLeftRadius: 3,
        borderBottomRightRadius: 3,
    },
    titleContainer: {
        marginBottom: 28,
        alignItems: "center",
    },
    title: {
        color: "#F59E0B",
        fontSize: 24,
        textAlign: "center",
        letterSpacing: 1.5,
        textTransform: "uppercase",
    },
    titleUnderline: {
        width: 60,
        height: 3,
        backgroundColor: "#F59E0B",
        marginTop: 8,
        borderRadius: 2,
    },
    playersContainer: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 28,
        paddingHorizontal: 8,
    },
    playerSection: {
        flex: 1,
        alignItems: "center",
    },
    sparkle: {
        position: "absolute",
        zIndex: 10,
    },
    avatarContainer: {
        marginBottom: 14,
        position: "relative",
    },
    avatarRing: {
        padding: 4,
        borderRadius: 60,
        borderWidth: 3,
    },
    player1Ring: {
        borderColor: "#6366F1",
        backgroundColor: "rgba(99, 102, 241, 0.1)",
    },
    player2Ring: {
        borderColor: "#10B981",
        backgroundColor: "rgba(16, 185, 129, 0.1)",
    },
    avatar: {
        width: 90,
        height: 90,
        borderRadius: 45,
        overflow: "hidden",
        borderWidth: 3,
        borderColor: "#1E293B",
    },
    avatarGlowActive: {
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 15,
    },
    avatarImage: {
        width: "100%",
        height: "100%",
    },
    statusBadge: {
        position: "absolute",
        bottom: -10,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: "#1E293B",
    },
    player1Badge: {
        backgroundColor: "#6366F1",
    },
    player2Badge: {
        backgroundColor: "#10B981",
    },
    statusBadgeText: {
        color: "#fff",
        fontSize: 10,
        letterSpacing: 0.5,
    },
    playerName: {
        color: "#F1F5F9",
        fontSize: 16,
        marginBottom: 10,
        textAlign: "center",
        maxWidth: 110,
    },
    stakeCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(239, 68, 68, 0.15)",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: "rgba(239, 68, 68, 0.4)",
        gap: 8,
    },
    stakeIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(239, 68, 68, 0.2)",
        alignItems: "center",
        justifyContent: "center",
    },
    stakeLabel: {
        color: "rgba(248, 113, 113, 0.8)",
        fontSize: 10,
        marginBottom: 2,
        letterSpacing: 0.5,
    },
    stakeAmount: {
        color: "#F87171",
        fontSize: 16,
        letterSpacing: 0.5,
    },
    vsSection: {
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 16,
        position: "relative",
        paddingVertical: 20,
    },
    lightningEffect: {
        position: "absolute",
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: "rgba(251, 191, 36, 0.2)",
        alignItems: "center",
        justifyContent: "center",
    },
    lightningInner: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: "rgba(251, 191, 36, 0.3)",
    },
    vsBadge: {
        width: 70,
        height: 70,
        borderRadius: 35,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#F59E0B",
        borderWidth: 4,
        borderColor: "#1E293B",
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 20,
        zIndex: 10,
    },
    vsInner: {
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
    },
    vsText: {
        color: "#fff",
        fontSize: 22,
        letterSpacing: 2,
        textShadowColor: "rgba(0, 0, 0, 0.3)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    energyBolt: {
        position: "absolute",
        width: 3,
        height: 30,
        backgroundColor: "#FBBF24",
        opacity: 0.6,
    },
    energyBoltLeft: {
        left: -20,
        top: "50%",
        marginTop: -15,
        transform: [{ rotate: "-25deg" }],
    },
    energyBoltRight: {
        right: -20,
        top: "50%",
        marginTop: -15,
        transform: [{ rotate: "25deg" }],
    },
    prizePoolCard: {
        backgroundColor: "#1E293B",
        borderRadius: 20,
        marginBottom: 20,
        borderWidth: 2,
        borderColor: "#F59E0B",
        overflow: "hidden",
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 15,
    },
    prizePoolBg: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(245, 158, 11, 0.05)",
    },
    prizePoolContent: {
        padding: 20,
        alignItems: "center",
    },
    prizePoolHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: 16,
    },
    prizePoolTitle: {
        color: "#F59E0B",
        fontSize: 14,
        letterSpacing: 1.5,
        textTransform: "uppercase",
    },
    prizePoolAmountContainer: {
        flexDirection: "row",
        alignItems: "baseline",
        gap: 6,
        marginBottom: 12,
    },
    prizePoolAmount: {
        color: "#FFD700",
        fontSize: 48,
        letterSpacing: 1,
        textShadowColor: "rgba(245, 158, 11, 0.5)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 12,
    },
    prizePoolXP: {
        color: "#FBBF24",
        fontSize: 20,
        letterSpacing: 1,
    },
    prizePoolDivider: {
        width: 80,
        height: 2,
        backgroundColor: "rgba(245, 158, 11, 0.3)",
        marginBottom: 10,
        borderRadius: 1,
    },
    prizePoolSubtext: {
        color: "rgba(248, 250, 252, 0.6)",
        fontSize: 12,
        letterSpacing: 0.5,
    },
    successCard: {
        backgroundColor: "rgba(16, 185, 129, 0.1)",
        padding: 18,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: "rgba(16, 185, 129, 0.3)",
        alignItems: "center",
    },
    successIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "rgba(16, 185, 129, 0.15)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
    },
    successText: {
        color: "#10B981",
        fontSize: 16,
        textAlign: "center",
        marginBottom: 6,
        letterSpacing: 0.5,
    },
    successSubtext: {
        color: "rgba(52, 211, 153, 0.8)",
        fontSize: 13,
        textAlign: "center",
        lineHeight: 19,
    },
    bottomAccent: {
        position: "absolute",
        bottom: 0,
        left: "25%",
        right: "25%",
        height: 3,
        backgroundColor: "#6366F1",
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
    },
})

export default DuoVsModal