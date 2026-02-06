"use client"

import { useState, useEffect, useRef } from "react"
import { Modal, View, Image, Animated, Easing, StyleSheet, Dimensions } from "react-native"
import CustomText from "../CustomText"
import Ionicons from "react-native-vector-icons/Ionicons"
import { doc, getDoc } from "firebase/firestore"
import { db } from "../../firebaseConfig"
import { finalizeTimeChallenge } from "../../utils/CommunityBackend"

const { width } = Dimensions.get("window")
const DEFAULT_AVATAR = "https://res.cloudinary.com/dljywnlvh/image/upload/v1747077348/default-avatar_jkbpwv.jpg"

const SquadVsModal = ({
    visible,
    challengeId,
    participants = [], // Array of User IDs
    stakeXP,
    fullChallenge,
    onClose,
    navigateToActivityWithChallenge,
}) => {
    const [players, setPlayers] = useState([])
    const [loading, setLoading] = useState(true)
    const [animationStage, setAnimationStage] = useState(0)

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current
    const scaleAnim = useRef(new Animated.Value(0.8)).current
    const prizePoolScale = useRef(new Animated.Value(0)).current
    const prizePoolRotate = useRef(new Animated.Value(0)).current

    // We create a fixed array of animated values for up to 5 players
    const playerAnims = useRef([...Array(5)].map(() => new Animated.Value(0))).current

    // Fetch Player Data
    useEffect(() => {
        const fetchParticipants = async () => {
            if (!challengeId || !visible) return

            setLoading(true)
            try {
                // 1. Fetch latest challenge data to ensure we have the correct participant list
                const challengeRef = doc(db, "challenges", challengeId)
                const challengeSnap = await getDoc(challengeRef)

                let currentParticipantIds = participants
                let currentStake = stakeXP

                if (challengeSnap.exists()) {
                    const data = challengeSnap.data()
                    currentParticipantIds = data.participants || participants
                    currentStake = data.stakeXP || stakeXP
                }

                // 2. Fetch User Profiles
                const userPromises = currentParticipantIds.map(async (uid) => {
                    try {
                        const userSnap = await getDoc(doc(db, "users", uid))
                        if (userSnap.exists()) {
                            const userData = userSnap.data()
                            return {
                                id: uid,
                                displayName: userData.displayName || userData.username || "Player",
                                avatar: userData.avatar || DEFAULT_AVATAR,
                            }
                        }
                    } catch (err) {
                        console.warn(`Failed to load user ${uid}`, err)
                    }
                    return { id: uid, displayName: "Player", avatar: DEFAULT_AVATAR }
                })

                const fetchedPlayers = await Promise.all(userPromises)
                setPlayers(fetchedPlayers)

                // Start Animation after data is ready
                startAnimationSequence(fetchedPlayers.length)

            } catch (error) {
                console.error("SquadVsModal error:", error)
            } finally {
                setLoading(false)
            }
        }

        if (visible) {
            fetchParticipants()
        } else {
            resetAnimations()
        }
    }, [visible, challengeId])

    const resetAnimations = () => {
        setAnimationStage(0)
        fadeAnim.setValue(0)
        scaleAnim.setValue(0.8)
        prizePoolScale.setValue(0)
        prizePoolRotate.setValue(0)
        playerAnims.forEach(anim => anim.setValue(0))
    }

    const startAnimationSequence = (playerCount) => {
        setAnimationStage(0)

        // Stage 1: Modal Fade In
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.spring(scaleAnim, { toValue: 1, tension: 50, useNativeDriver: true })
        ]).start()

        // Stage 2: Players Pop In Staggered
        setTimeout(() => {
            setAnimationStage(1)
            const animations = playerAnims.slice(0, playerCount).map(anim =>
                Animated.spring(anim, {
                    toValue: 1,
                    tension: 60,
                    friction: 7,
                    useNativeDriver: true
                })
            )
            Animated.stagger(200, animations).start()
        }, 500)

        // Stage 3: Prize Pool Explosion
        setTimeout(() => {
            setAnimationStage(2)
            Animated.parallel([
                Animated.spring(prizePoolScale, {
                    toValue: 1,
                    tension: 40,
                    friction: 5,
                    useNativeDriver: true
                }),
                Animated.loop(
                    Animated.timing(prizePoolRotate, {
                        toValue: 1,
                        duration: 8000,
                        easing: Easing.linear,
                        useNativeDriver: true
                    })
                ).start()
            ]).start()
        }, 500 + (playerCount * 200) + 200)

        // Stage 4: Navigation
        setTimeout(() => {
            if (onClose) onClose()
            if (navigateToActivityWithChallenge && fullChallenge) {
                navigateToActivityWithChallenge(fullChallenge, true) // skipAnimation=true because we just showed it
            }
        }, 4500)
    }

    const spin = prizePoolRotate.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    })

    if (!visible) return null

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>

                    {/* Header */}
                    <View style={styles.header}>
                        <CustomText weight="black" style={styles.title}>SQUAD BATTLE</CustomText>
                        <CustomText style={styles.subtitle}>Free For All</CustomText>
                    </View>

                    {/* Players Grid */}
                    <View style={styles.gridContainer}>
                        {players.map((player, index) => (
                            <Animated.View
                                key={player.id}
                                style={[
                                    styles.playerCard,
                                    {
                                        opacity: playerAnims[index],
                                        transform: [
                                            { scale: playerAnims[index] },
                                            {
                                                translateY: playerAnims[index].interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [50, 0]
                                                })
                                            }
                                        ]
                                    }
                                ]}
                            >
                                <View style={[styles.avatarRing, { borderColor: getPlayerColor(index) }]}>
                                    <Image source={{ uri: player.avatar }} style={styles.avatar} />
                                </View>
                                <CustomText weight="bold" style={styles.playerName} numberOfLines={1}>
                                    {player.displayName}
                                </CustomText>
                            </Animated.View>
                        ))}
                    </View>

                    {/* Central Prize Pool */}
                    <Animated.View style={[styles.prizeContainer, { transform: [{ scale: prizePoolScale }] }]}>
                        {/* Rotating Sunburst behind */}
                        <Animated.View style={[styles.sunburst, { transform: [{ rotate: spin }] }]}>
                            <Ionicons name="sunny" size={180} color="#FFD700" style={{ opacity: 0.2 }} />
                        </Animated.View>

                        <View style={styles.prizeBadge}>
                            <CustomText weight="bold" style={styles.prizeLabel}>TOTAL POT</CustomText>
                            <CustomText weight="black" style={styles.prizeValue}>{stakeXP}</CustomText>
                            <CustomText weight="bold" style={styles.prizeUnit}>XP</CustomText>
                        </View>
                    </Animated.View>

                    {/* Footer Status */}
                    <View style={styles.footer}>
                        <Ionicons name="flash" size={16} color="#EF4444" />
                        <CustomText style={styles.footerText}>
                            {players.length} Players Ready • Winner Takes All
                        </CustomText>
                        <Ionicons name="flash" size={16} color="#EF4444" />
                    </View>

                </Animated.View>
            </View>
        </Modal>
    )
}

// Helper to give distinct colors to up to 5 players
const getPlayerColor = (index) => {
    const colors = ['#4361EE', '#EF476F', '#06D6A0', '#FFC107', '#9B5DE5']
    return colors[index % colors.length]
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.9)",
        justifyContent: "center",
        alignItems: "center",
    },
    container: {
        width: width * 0.9,
        backgroundColor: "#1F2937",
        borderRadius: 30,
        padding: 20,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#374151",
        overflow: 'hidden'
    },
    header: {
        alignItems: 'center',
        marginBottom: 30,
    },
    title: {
        color: "#FFF",
        fontSize: 28,
        letterSpacing: 2,
        fontStyle: 'italic',
    },
    subtitle: {
        color: "#9CA3AF",
        fontSize: 14,
        letterSpacing: 4,
        textTransform: 'uppercase',
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 15,
        marginBottom: 30,
        zIndex: 2, // Above sunburst
    },
    playerCard: {
        alignItems: 'center',
        width: '30%', // Fits 3 in a row, wraps for 4 or 5
    },
    avatarRing: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 3,
        padding: 3,
        marginBottom: 8,
        backgroundColor: '#111827',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
    },
    playerName: {
        color: "#FFF",
        fontSize: 12,
        textAlign: 'center',
    },
    prizeContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        height: 120,
        width: '100%',
        zIndex: 1,
    },
    sunburst: {
        position: 'absolute',
    },
    prizeBadge: {
        backgroundColor: '#F59E0B', // Gold/Orange
        paddingVertical: 10,
        paddingHorizontal: 30,
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#FFF',
        shadowColor: "#F59E0B",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 10,
    },
    prizeLabel: {
        color: '#78350F',
        fontSize: 10,
        fontWeight: 'bold',
    },
    prizeValue: {
        color: '#FFF',
        fontSize: 36,
        lineHeight: 40,
    },
    prizeUnit: {
        color: '#FFF',
        fontSize: 14,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 10,
    },
    footerText: {
        color: '#EF4444', // Red accent
        fontSize: 12,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    }
})

export default SquadVsModal