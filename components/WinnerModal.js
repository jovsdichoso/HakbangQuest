"use client"
import React, { useEffect, useRef } from 'react';
import { Modal, View, Image, TouchableOpacity, Animated, StyleSheet, Dimensions } from 'react-native';
import twrnc from 'twrnc';
import Ionicons from "react-native-vector-icons/Ionicons";
import CustomText from "../components/CustomText";

const { width } = Dimensions.get('window');

const WinnerModal = ({ visible, onClose, result, participantsData, currentUserId }) => {
    // Animation Refs
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const confAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
                Animated.timing(rotateAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
                Animated.timing(confAnim, { toValue: 1, duration: 800, useNativeDriver: true })
            ]).start();
        } else {
            scaleAnim.setValue(0.8);
            rotateAnim.setValue(0);
        }
    }, [visible]);

    if (!result) return null;

    const isMe = result.winnerId === currentUserId;
    const winner = participantsData[result.winnerId] || { displayName: "Champion", avatar: null };

    // Rotating rays background animation
    const spin = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '90deg']
    });

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>

                {/* Background Celebration Rays */}
                <Animated.View style={[styles.raysContainer, { transform: [{ rotate: spin }] }]}>
                    <Ionicons name="sunny" size={width * 1.5} color="rgba(255, 215, 0, 0.15)" />
                </Animated.View>

                <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>

                    {/* Header Trophy */}
                    <View style={styles.trophyCircle}>
                        <Ionicons name="trophy" size={50} color="#FFD700" />
                        <View style={styles.sparkleOne}><Ionicons name="sparkles" size={20} color="#FFF" /></View>
                    </View>

                    <CustomText weight="black" style={styles.title}>
                        {isMe ? "VICTORY!" : "CHALLENGE ENDED"}
                    </CustomText>

                    {/* Winner Spotlight */}
                    <View style={styles.winnerSection}>
                        <View style={[styles.avatarRing, { borderColor: isMe ? '#10B981' : '#F59E0B' }]}>
                            <Image
                                source={{ uri: winner.avatar || 'https://res.cloudinary.com/dljywnlvh/image/upload/v1747077348/default-avatar_jkbpwv.jpg' }}
                                style={styles.avatar}
                            />
                            <View style={styles.winnerBadge}>
                                <Ionicons name="ribbon" size={16} color="#FFF" />
                            </View>
                        </View>
                        <CustomText weight="bold" style={styles.winnerName}>
                            {isMe ? "YOU ARE THE WINNER!" : `${winner.displayName} WON!`}
                        </CustomText>
                    </View>

                    {/* XP Payout Card */}
                    <View style={styles.payoutCard}>
                        <CustomText style={styles.payoutLabel}>TOTAL REWARD RECEIVED</CustomText>
                        <View style={styles.xpRow}>
                            <Ionicons name="flash" size={24} color="#FFD700" />
                            <CustomText weight="black" style={styles.xpAmount}>
                                +{result.prizePool}
                            </CustomText>
                            <CustomText weight="bold" style={styles.xpUnit}>XP</CustomText>
                        </View>
                    </View>

                    <CustomText style={styles.statsText}>
                        Score: <CustomText weight="bold" style={{ color: '#FFF' }}>{result.highestScore || 'N/A'}</CustomText>
                    </CustomText>

                    {/* Action Button */}
                    <TouchableOpacity
                        onPress={onClose}
                        style={[styles.button, { backgroundColor: isMe ? '#10B981' : '#6366F1' }]}
                        activeOpacity={0.8}
                    >
                        <CustomText weight="bold" style={styles.buttonText}>
                            {isMe ? "COLLECT REWARD" : "CLOSE"}
                        </CustomText>
                    </TouchableOpacity>

                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(7, 10, 15, 0.95)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    raysContainer: {
        position: 'absolute',
        zIndex: -1,
    },
    container: {
        width: '85%',
        backgroundColor: '#111827',
        borderRadius: 30,
        padding: 25,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.3)',
        shadowColor: "#FFD700",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
    },
    trophyCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: -70,
        borderWidth: 4,
        borderColor: '#111827',
    },
    sparkleOne: {
        position: 'absolute',
        top: 0,
        right: 0,
    },
    title: {
        color: '#FFD700',
        fontSize: 28,
        marginTop: 15,
        letterSpacing: 2,
    },
    winnerSection: {
        alignItems: 'center',
        marginVertical: 20,
    },
    avatarRing: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 4,
        padding: 5,
        marginBottom: 10,
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: 50,
    },
    winnerBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#F59E0B',
        width: 30,
        height: 30,
        borderRadius: 15,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#111827',
    },
    winnerName: {
        color: '#F9FAFB',
        fontSize: 18,
        textAlign: 'center',
    },
    payoutCard: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        width: '100%',
        padding: 15,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        alignItems: 'center',
    },
    payoutLabel: {
        color: '#10B981',
        fontSize: 10,
        letterSpacing: 1,
        marginBottom: 5,
    },
    xpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    xpAmount: {
        color: '#FFF',
        fontSize: 32,
    },
    xpUnit: {
        color: '#10B981',
        fontSize: 18,
    },
    statsText: {
        color: '#9CA3AF',
        fontSize: 14,
        marginTop: 15,
        marginBottom: 20,
    },
    button: {
        width: '100%',
        paddingVertical: 15,
        borderRadius: 15,
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        letterSpacing: 1,
    }
});

export default WinnerModal;