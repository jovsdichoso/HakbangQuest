import { Modal, View, TouchableOpacity, Image, ScrollView, Animated } from "react-native"
import { useState, useEffect, useRef } from "react"
import twrnc from "twrnc"
import CustomText from "../CustomText"
import { Ionicons } from "@expo/vector-icons"
import { getActivityDisplayInfo } from "../../utils/activityDisplayMapper"

const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"

const FriendProfileModal = ({ isVisible, onClose, selectedFriend, formatLastActive, formatTime }) => {
    // Animation refs
    const fadeAnim = useRef(new Animated.Value(0)).current
    const slideAnim = useRef(new Animated.Value(50)).current
    const summaryFadeAnims = useRef([
        new Animated.Value(0),
        new Animated.Value(0),
        new Animated.Value(0)
    ]).current

    // Trigger animations when modal becomes visible
    useEffect(() => {
        if (isVisible) {
            fadeAnim.setValue(0)
            slideAnim.setValue(50)
            summaryFadeAnims.forEach(anim => anim.setValue(0))

            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }).start()

            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 500,
                useNativeDriver: true,
            }).start()

            Animated.stagger(150, 
                summaryFadeAnims.map(anim =>
                    Animated.timing(anim, {
                        toValue: 1,
                        duration: 400,
                        useNativeDriver: true,
                    })
                )
            ).start()
        }
    }, [isVisible])

    if (!selectedFriend) return null

    const activityInfo = selectedFriend.lastActivity 
        ? getActivityDisplayInfo(selectedFriend.lastActivity) 
        : null

    const statusColor = selectedFriend.isOnline ? "#10B981" : "#6B7280"

    return (
        <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={onClose}>
            <View style={twrnc`flex-1 bg-black bg-opacity-50 justify-end`}>
                <Animated.View 
                    style={[
                        twrnc`bg-[#1F2937] rounded-t-3xl p-5 h-3/4`,
                        {
                            opacity: fadeAnim,
                            transform: [{ translateY: slideAnim }]
                        }
                    ]}
                >
                    {/* Header with Colorful Inner Strip */}
                    <View style={[twrnc`h-1 mb-4 rounded-full overflow-hidden`, { backgroundColor: statusColor }]}>
                        <View style={twrnc`h-full flex-row`}>
                            {[...Array(20)].map((_, i) => (
                                <View 
                                    key={i} 
                                    style={[
                                        twrnc`flex-1`,
                                        { backgroundColor: i % 2 === 0 ? statusColor : `${statusColor}CC` }
                                    ]} 
                                />
                            ))}
                        </View>
                    </View>

                    {/* Header */}
                    <View style={twrnc`flex-row justify-between items-center mb-4`}>
                        <CustomText weight="bold" style={twrnc`text-white text-xl flex-1`}>
                            Friend Profile
                        </CustomText>
                        <TouchableOpacity 
                            onPress={onClose}
                            accessibilityLabel="Close friend profile"
                            style={[twrnc`p-2.5 rounded-xl`, { backgroundColor: `${statusColor}20` }]}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="close" size={20} color={statusColor} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Icon/Avatar */}
                        <Animated.View style={[twrnc`mb-4 self-center`, { opacity: fadeAnim }]}>
                            <View 
                                style={[
                                    twrnc`w-20 h-20 rounded-2xl items-center justify-center`,
                                    { backgroundColor: statusColor, transform: [{ rotate: '5deg' }] }
                                ]}
                            >
                                <Image
                                    source={{ uri: selectedFriend.avatar || DEFAULT_AVATAR }}
                                    style={twrnc`w-16 h-16 rounded-xl`}
                                />
                            </View>
                        </Animated.View>

                        {/* Summary Cards */}
                        <View style={twrnc`flex-row justify-between mb-5 -mx-1`}>
                            {/* Streak Card */}
                            <Animated.View 
                                style={[
                                    twrnc`rounded-xl px-3 py-3 flex-1 mx-1`,
                                    { opacity: summaryFadeAnims[0], backgroundColor: `${statusColor}15` }
                                ]}
                            >
                                <CustomText style={[twrnc`text-9px uppercase mb-1`, { color: statusColor }]}>
                                    Streak
                                </CustomText>
                                <CustomText weight="bold" style={[twrnc`text-sm`, { color: statusColor }]}>
                                    {selectedFriend.streak || 0} days
                                </CustomText>
                            </Animated.View>

                            {/* Distance Card */}
                            <Animated.View 
                                style={[
                                    twrnc`bg-[#34D399] rounded-xl px-3 py-3 flex-1 mx-1`,
                                    { opacity: summaryFadeAnims[1] }
                                ]}
                            >
                                <CustomText style={twrnc`text-[#064E3B] text-9px uppercase mb-1`}>
                                    Distance
                                </CustomText>
                                <CustomText weight="bold" style={twrnc`text-[#064E3B] text-sm`}>
                                    {selectedFriend.totalDistance ? selectedFriend.totalDistance.toFixed(1) : "0"} km
                                </CustomText>
                            </Animated.View>

                            {/* Activities Card */}
                            <Animated.View 
                                style={[
                                    twrnc`bg-[#A855F7] rounded-xl px-3 py-3 flex-1 mx-1`,
                                    { opacity: summaryFadeAnims[2] }
                                ]}
                            >
                                <CustomText style={twrnc`text-white text-9px uppercase mb-1`}>
                                    Workouts
                                </CustomText>
                                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                                    {selectedFriend.totalActivities || 0}
                                </CustomText>
                            </Animated.View>
                        </View>

                        {/* Friend Name & Status */}
                        <View style={twrnc`mb-5`}>
                            <CustomText weight="bold" style={twrnc`text-white text-2xl mb-2 text-center`}>
                                {selectedFriend.displayName || selectedFriend.username || "User"}
                            </CustomText>
                            <View style={twrnc`flex-row items-center justify-center`}>
                                <View 
                                    style={[
                                        twrnc`w-2 h-2 rounded-full mr-2`,
                                        { backgroundColor: statusColor }
                                    ]} 
                                />
                                <CustomText style={twrnc`text-gray-400 text-sm`}>
                                    {selectedFriend.isOnline ? "Active now" : "Offline"}
                                </CustomText>
                            </View>
                        </View>

                        {/* Recent Activity */}
                        <View style={twrnc`mb-6`}>
                            <CustomText weight="semibold" style={twrnc`text-white text-sm mb-3`}>
                                Recent Activity
                            </CustomText>
                            
                            {activityInfo ? (
                                <View 
                                    style={[
                                        twrnc`bg-[#111827] rounded-xl p-4 border-l-4`,
                                        { borderLeftColor: activityInfo?.color || "#FFC107" }
                                    ]}
                                >
                                    {/* Activity Header */}
                                    <View style={twrnc`flex-row items-center mb-4`}>
                                        <View 
                                            style={[
                                                twrnc`w-12 h-12 rounded-xl items-center justify-center mr-3`,
                                                { backgroundColor: `${activityInfo?.color || "#FFC107"}20` }
                                            ]}
                                        >
                                            <Ionicons
                                                name={activityInfo?.icon || "fitness-outline"}
                                                size={24}
                                                color={activityInfo?.color || "#FFC107"}
                                            />
                                        </View>
                                        <View style={twrnc`flex-1`}>
                                            <CustomText weight="bold" style={twrnc`text-white text-base mb-0.5`}>
                                                {activityInfo?.displayName || "Activity"}
                                            </CustomText>
                                            <CustomText style={twrnc`text-gray-400 text-xs`}>
                                                {selectedFriend.lastActivity.createdAt
                                                    ? formatLastActive(selectedFriend.lastActivity.createdAt)
                                                    : "Recently"}
                                            </CustomText>
                                        </View>
                                    </View>

                                    {/* Activity Stats */}
                                    <View style={twrnc`flex-row justify-between`}>
                                        {activityInfo?.isGpsActivity ? (
                                            <>
                                                <View style={twrnc`items-center flex-1`}>
                                                    <Ionicons name="navigate" size={16} color="#4361EE" style={twrnc`mb-1`} />
                                                    <CustomText weight="bold" style={twrnc`text-[#4361EE] text-sm`}>
                                                        {activityInfo.values.distance || "0"}
                                                    </CustomText>
                                                    <CustomText style={twrnc`text-gray-500 text-9px uppercase`}>
                                                        km
                                                    </CustomText>
                                                </View>
                                                <View style={twrnc`items-center flex-1`}>
                                                    <Ionicons name="time" size={16} color="#06D6A0" style={twrnc`mb-1`} />
                                                    <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-sm`}>
                                                        {formatTime(activityInfo.values.duration)}
                                                    </CustomText>
                                                    <CustomText style={twrnc`text-gray-500 text-9px uppercase`}>
                                                        time
                                                    </CustomText>
                                                </View>
                                                <View style={twrnc`items-center flex-1`}>
                                                    <Ionicons name="speedometer" size={16} color="#FFC107" style={twrnc`mb-1`} />
                                                    <CustomText weight="bold" style={twrnc`text-[#FFC107] text-sm`}>
                                                        {formatTime(activityInfo.values.pace)}
                                                    </CustomText>
                                                    <CustomText style={twrnc`text-gray-500 text-9px uppercase`}>
                                                        /km
                                                    </CustomText>
                                                </View>
                                            </>
                                        ) : (
                                            <>
                                                <View style={twrnc`items-center flex-1`}>
                                                    <Ionicons name="fitness" size={16} color="#9B5DE5" style={twrnc`mb-1`} />
                                                    <CustomText weight="bold" style={twrnc`text-[#9B5DE5] text-sm`}>
                                                        {activityInfo.values.reps || "0"}
                                                    </CustomText>
                                                    <CustomText style={twrnc`text-gray-500 text-9px uppercase`}>
                                                        reps
                                                    </CustomText>
                                                </View>
                                                <View style={twrnc`items-center flex-1`}>
                                                    <Ionicons name="repeat" size={16} color="#06D6A0" style={twrnc`mb-1`} />
                                                    <CustomText weight="bold" style={twrnc`text-[#06D6A0] text-sm`}>
                                                        {activityInfo.values.sets || "1"}
                                                    </CustomText>
                                                    <CustomText style={twrnc`text-gray-500 text-9px uppercase`}>
                                                        sets
                                                    </CustomText>
                                                </View>
                                                <View style={twrnc`items-center flex-1`}>
                                                    <Ionicons name="time" size={16} color="#FFC107" style={twrnc`mb-1`} />
                                                    <CustomText weight="bold" style={twrnc`text-[#FFC107] text-sm`}>
                                                        {formatTime(activityInfo.values.duration)}
                                                    </CustomText>
                                                    <CustomText style={twrnc`text-gray-500 text-9px uppercase`}>
                                                        time
                                                    </CustomText>
                                                </View>
                                            </>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                <View style={twrnc`bg-[#111827] rounded-xl p-6 items-center`}>
                                    <Ionicons name="fitness-outline" size={48} color="#374151" />
                                    <CustomText weight="semibold" style={twrnc`text-gray-400 text-sm text-center mt-3`}>
                                        No Recent Activity
                                    </CustomText>
                                    <CustomText style={twrnc`text-gray-500 text-xs text-center mt-1`}>
                                        This friend hasn't recorded any activities yet
                                    </CustomText>
                                </View>
                            )}
                        </View>
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    )
}

export default FriendProfileModal
