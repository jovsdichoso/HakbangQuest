// FileName: BadgeComponents.js
import { View, TouchableOpacity, Modal, ScrollView, Dimensions, Animated, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import twrnc from "twrnc"
import CustomText from "./CustomText"
import { BADGE_COLORS } from "../screens/BadgeSystem"
import { useEffect, useRef, useState } from "react"

const { width } = Dimensions.get("window")

// Individual Badge Component
export const BadgeItem = ({ badge, size = "medium", onPress }) => {
  const sizeStyles = {
    small: { container: "w-12 h-12", icon: 16, text: "text-[10px]" },
    medium: { container: "w-14 h-14", icon: 18, text: "text-xs" },
    large: { container: "w-16 h-16", icon: 20, text: "text-sm" },
  }

  const style = sizeStyles[size]

  // --- VISUAL LOGIC FOR LOCKED BADGES ---
  const isLocked = badge.locked === true;

  // If locked, use Gray (#64748b). If unlocked, use the Rarity Color.
  const badgeColor = isLocked ? "#64748b" : (BADGE_COLORS[badge.rarity] || BADGE_COLORS.common)

  // Logic: It is unclaimed if it has an earned date but claimed is false
  // Locked badges cannot be unclaimed rewards.
  const hasUnclaimedReward = !isLocked && badge.earnedAt && badge.claimed === false;

  return (
    <TouchableOpacity
      style={[
        twrnc`${style.container} items-center justify-center rounded-xl relative`,
        isLocked && { opacity: 0.6 } // Dim locked badges
      ]}
      onPress={() => onPress && onPress(badge)}
      activeOpacity={0.8}
    >
      <View
        style={[
          twrnc`w-full h-full rounded-xl items-center justify-center`,
          // If locked, specific dark background with border. If unlocked, standard tint.
          isLocked
            ? { backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" }
            : { backgroundColor: `${badgeColor}20` }
        ]}
      >
        <Ionicons name={badge.icon || "trophy"} size={style.icon} color={badgeColor} />

        {/* Lock Overlay Icon */}
        {isLocked && (
          <View style={twrnc`absolute bottom-1 right-1`}>
            <Ionicons name="lock-closed" size={8} color="#94a3b8" />
          </View>
        )}
      </View>

      {/* New Badge Indicator (Pink) - Only show if unlocked and NO unclaimed reward */}
      {badge.isNew && !hasUnclaimedReward && !isLocked && (
        <View style={twrnc`absolute -top-1 -right-1 bg-[#EF476F] rounded-full w-2.5 h-2.5 border border-[#1e293b]`} />
      )}

      {/* Unclaimed Reward Indicator (Gold/Yellow) */}
      {hasUnclaimedReward && (
        <View style={twrnc`absolute -top-1 -right-1 bg-[#FFC107] rounded-full w-3 h-3 border border-[#1e293b] justify-center items-center`}>
          <View style={twrnc`w-1 h-1 bg-black rounded-full`} />
        </View>
      )}
    </TouchableOpacity>
  )
}

// Badge Grid Component
export const BadgeGrid = ({ badges, onBadgePress, maxVisible = 6, variant = "default" }) => {
  const visibleBadges = badges.slice(0, maxVisible)
  const remainingCount = Math.max(0, badges.length - maxVisible)
  const isCompact = variant === "compact"

  return (
    <View style={twrnc`flex-row flex-wrap ${isCompact ? "gap-2" : "gap-3"}`}>
      {visibleBadges.map((badge, index) => (
        <BadgeItem key={badge.id || index} badge={badge} size={isCompact ? "small" : "medium"} onPress={onBadgePress} />
      ))}
      {remainingCount > 0 && (
        <View
          style={[
            twrnc`${isCompact ? "w-12 h-12" : "w-14 h-14"} rounded-xl items-center justify-center bg-[#0f172a] border border-gray-700`,
          ]}
        >
          <CustomText weight="bold" style={twrnc`text-gray-400 text-xs`}>
            +{remainingCount}
          </CustomText>
        </View>
      )}
    </View>
  )
}

// Badge Details Modal - REDESIGNED WITH LOCKED STATE & CLAIM BUTTON
export const BadgeModal = ({ visible, badge, onClose, onClaim }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(50)).current
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0)
      slideAnim.setValue(50)
      setIsClaiming(false) // Reset state
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible])

  if (!badge) return null

  // Handle Locked State for Colors
  const isLocked = badge.locked === true;
  const badgeColor = isLocked ? "#64748b" : (BADGE_COLORS[badge.rarity] || BADGE_COLORS.common);

  const isEarned = !!badge.earnedAt;
  const isClaimed = badge.claimed === true;
  const xpReward = badge.xpReward || 0;

  const handleClaimPress = async () => {
    if (onClaim) {
      setIsClaiming(true);
      await onClaim(badge);
      setIsClaiming(false);
    }
  }

  return (
    <Modal animationType="fade" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={twrnc`flex-1 bg-black/60 justify-center items-center px-5`}>
        <Animated.View
          style={[
            twrnc`bg-[#1e293b] rounded-3xl w-full max-w-sm overflow-hidden`,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header with Pattern */}
          <View style={twrnc`bg-[#0f172a] p-5 relative overflow-hidden`}>
            <View style={[twrnc`absolute -top-10 -right-10 w-32 h-32`, { opacity: 0.1 }]}>
              <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                {[...Array(16)].map((_, i) => (
                  <View key={i} style={[twrnc`w-1/4 h-1/4 border`, { borderColor: badgeColor, transform: [{ rotate: "45deg" }] }]} />
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={twrnc`absolute top-3 right-3 bg-[#1e293b] p-2 rounded-xl z-10`}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={twrnc`items-center relative z-10`}>
              <View
                style={[
                  twrnc`w-24 h-24 rounded-3xl items-center justify-center mb-3`,
                  { backgroundColor: isLocked ? "#1e293b" : `${badgeColor}30`, borderWidth: isLocked ? 2 : 0, borderColor: "#334155" },
                ]}
              >
                <Ionicons name={badge.icon || "trophy"} size={48} color={badgeColor} />
                {isLocked && <View style={twrnc`absolute`}><Ionicons name="lock-closed" size={24} color="#94a3b8" /></View>}
              </View>

              <View style={[twrnc`rounded-full px-3 py-1 mb-2`, { backgroundColor: isLocked ? "#334155" : `${badgeColor}40` }]}>
                <CustomText weight="bold" style={[twrnc`text-xs uppercase`, { color: isLocked ? "#94a3b8" : badgeColor }]}>
                  {badge.rarity}
                </CustomText>
              </View>
            </View>
          </View>

          {/* Content */}
          <View style={twrnc`p-5`}>
            <CustomText weight="bold" style={twrnc`text-white text-lg mb-2 text-center`}>
              {badge.title}
            </CustomText>

            {/* Description is shown even if locked, so user knows what to do */}
            <CustomText style={twrnc`text-gray-400 text-xs text-center mb-5`}>
              {badge.description}
            </CustomText>

            <View style={twrnc`bg-[#0f172a] rounded-xl p-3 mb-3`}>
              <View style={twrnc`flex-row items-center justify-between mb-2`}>
                <View style={twrnc`flex-row items-center`}>
                  <View style={[twrnc`w-6 h-6 rounded-lg items-center justify-center mr-2`, { backgroundColor: isLocked ? "#334155" : `${badgeColor}20` }]}>
                    <Ionicons name="grid-outline" size={12} color={badgeColor} />
                  </View>
                  <CustomText style={twrnc`text-gray-400 text-xs`}>Category</CustomText>
                </View>
                <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                  {badge.category}
                </CustomText>
              </View>

              {/* Reward Row */}
              <View style={twrnc`flex-row items-center justify-between pt-2 border-t border-gray-700 mb-2`}>
                <View style={twrnc`flex-row items-center`}>
                  <View style={[twrnc`w-6 h-6 rounded-lg items-center justify-center mr-2`, { backgroundColor: `#FFC10720` }]}>
                    <Ionicons name="star" size={12} color="#FFC107" />
                  </View>
                  <CustomText style={twrnc`text-gray-400 text-xs`}>Reward</CustomText>
                </View>
                <CustomText weight="bold" style={twrnc`text-[#FFC107] text-xs`}>
                  +{xpReward} XP
                </CustomText>
              </View>

              {badge.earnedAt && (
                <View style={twrnc`flex-row items-center justify-between pt-2 border-t border-gray-700`}>
                  <View style={twrnc`flex-row items-center`}>
                    <View style={[twrnc`w-6 h-6 rounded-lg items-center justify-center mr-2`, { backgroundColor: `${badgeColor}20` }]}>
                      <Ionicons name="calendar-outline" size={12} color={badgeColor} />
                    </View>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>Earned</CustomText>
                  </View>
                  <CustomText weight="bold" style={twrnc`text-white text-xs`}>
                    {badge.earnedAt.toDate
                      ? badge.earnedAt.toDate().toLocaleDateString()
                      : new Date(badge.earnedAt).toLocaleDateString()}
                  </CustomText>
                </View>
              )}
            </View>

            {/* ACTION BUTTONS */}
            {isLocked ? (
              // LOCKED STATE
              <View style={twrnc`w-full`}>
                <View style={twrnc`bg-[#0f172a] border border-dashed border-gray-600 rounded-xl p-3 mb-3`}>
                  <CustomText weight="bold" style={twrnc`text-gray-400 text-xs text-center mb-1`}>
                    How to Unlock:
                  </CustomText>
                  <CustomText style={twrnc`text-gray-500 text-xs text-center italic`}>
                    "{badge.description}"
                  </CustomText>
                </View>

                <TouchableOpacity style={twrnc`bg-[#1e293b] border border-gray-700 rounded-xl py-3 items-center opacity-50`} disabled={true}>
                  <View style={twrnc`flex-row items-center`}>
                    <Ionicons name="lock-closed" size={16} color="#64748b" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-gray-500 text-sm`}>
                      Locked
                    </CustomText>
                  </View>
                </TouchableOpacity>
              </View>
            ) : isEarned && !isClaimed ? (
              // UNCLAIMED STATE
              <TouchableOpacity
                style={twrnc`bg-[#FFC107] rounded-xl py-3 items-center shadow-lg`}
                onPress={handleClaimPress}
                disabled={isClaiming}
                activeOpacity={0.8}
              >
                {isClaiming ? (
                  <ActivityIndicator size="small" color="#1e293b" />
                ) : (
                  <View style={twrnc`flex-row items-center`}>
                    <Ionicons name="gift-outline" size={18} color="#1e293b" style={twrnc`mr-2`} />
                    <CustomText weight="bold" style={twrnc`text-[#1e293b] text-sm`}>
                      Claim {xpReward} XP Reward
                    </CustomText>
                  </View>
                )}
              </TouchableOpacity>
            ) : (
              // CLAIMED STATE
              <TouchableOpacity style={twrnc`bg-[#1e293b] border border-gray-600 rounded-xl py-3 items-center`} onPress={onClose} activeOpacity={0.8}>
                <View style={twrnc`flex-row items-center`}>
                  <Ionicons name="checkmark-done-circle" size={18} color="#06D6A0" style={twrnc`mr-2`} />
                  <CustomText weight="bold" style={twrnc`text-gray-400 text-sm`}>
                    Reward Claimed
                  </CustomText>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

// Badge Notification Component (Only for Unlocked/New Badges)
export const BadgeNotification = ({ badges, visible, onClose }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(-100)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current

  useEffect(() => {
    if (visible && badges.length > 0) {
      fadeAnim.setValue(0)
      slideAnim.setValue(-100)
      scaleAnim.setValue(0.8)

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [visible, badges])

  if (!visible || badges.length === 0) return null

  return (
    <Modal animationType="none" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={twrnc`flex-1 bg-black/70 justify-center items-center px-5`}>
        <Animated.View
          style={[
            twrnc`bg-[#1e293b] rounded-3xl w-full max-w-sm overflow-hidden`,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            },
          ]}
        >
          <View style={twrnc`bg-gradient-to-r from-[#4361EE] to-[#06D6A0] p-6 relative overflow-hidden`}>
            {/* Pattern */}
            <View style={[twrnc`absolute top-0 right-0 w-32 h-32`, { opacity: 0.2 }]}>
              <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                {[...Array(16)].map((_, i) => (
                  <View key={i} style={[twrnc`w-1/4 h-1/4 border border-white`, { transform: [{ rotate: "45deg" }] }]} />
                ))}
              </View>
            </View>

            <View style={twrnc`items-center relative z-10`}>
              <View style={twrnc`bg-white bg-opacity-30 rounded-full p-3 mb-3`}>
                <Ionicons name="trophy" size={40} color="#FFFFFF" />
              </View>
              <CustomText weight="bold" style={twrnc`text-white text-xl mb-1`}>
                {badges.length === 1 ? "Badge Earned!" : `${badges.length} Badges Earned!`}
              </CustomText>
              <CustomText style={twrnc`text-white text-opacity-90 text-xs`}>Congratulations on your achievement!</CustomText>
            </View>
          </View>

          <ScrollView style={twrnc`max-h-80 p-5`} showsVerticalScrollIndicator={false}>
            {badges.map((badge, index) => {
              const badgeColor = BADGE_COLORS[badge.rarity] || BADGE_COLORS.common
              return (
                <View key={index} style={twrnc`bg-[#0f172a] rounded-2xl p-4 mb-3 flex-row items-center`}>
                  <View style={[twrnc`w-14 h-14 rounded-xl items-center justify-center mr-3`, { backgroundColor: `${badgeColor}30` }]}>
                    <Ionicons name={badge.icon || "trophy"} size={24} color={badgeColor} />
                  </View>
                  <View style={twrnc`flex-1`}>
                    <View style={twrnc`flex-row items-center mb-1`}>
                      <CustomText weight="bold" style={twrnc`text-white text-sm flex-1`}>
                        {badge.title}
                      </CustomText>
                      <View style={[twrnc`rounded-full px-2 py-0.5`, { backgroundColor: `${badgeColor}40` }]}>
                        <CustomText weight="bold" style={[twrnc`text-[9px] uppercase`, { color: badgeColor }]}>
                          {badge.rarity}
                        </CustomText>
                      </View>
                    </View>
                    <CustomText style={twrnc`text-gray-400 text-xs`}>{badge.description}</CustomText>
                    {/* XP Tag in notification */}
                    <View style={twrnc`bg-[#FFC107] bg-opacity-20 self-start rounded-full px-2 py-0.5 mt-1`}>
                      <CustomText style={twrnc`text-[#FFC107] text-[9px] font-bold`}>+{badge.xpReward || 0} XP Reward</CustomText>
                    </View>
                  </View>
                </View>
              )
            })}
          </ScrollView>

          <View style={twrnc`p-5 pt-0`}>
            <TouchableOpacity style={twrnc`bg-[#4361EE] rounded-xl py-3.5 items-center`} onPress={onClose} activeOpacity={0.8}>
              <View style={twrnc`flex-row items-center`}>
                <Ionicons name="checkmark-circle" size={18} color="white" style={twrnc`mr-2`} />
                <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                  Awesome!
                </CustomText>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

// Badge Section for Dashboard
export const BadgeSection = ({ badges, onViewAll, onBadgePress }) => {
  // If we have mixed badges (locked and earned), filter for display counts
  const earnedBadges = badges.filter(b => !b.locked);
  const earnedCount = earnedBadges.length;

  // We still show the first 6 items from the provided list (which might be mixed)
  // This lets user see "Next Goals" if they are top of list
  const recentBadges = badges.slice(0, 6);

  return (
    <View style={twrnc`bg-[#1e293b] rounded-2xl p-4 mb-5 overflow-hidden relative`}>
      <View style={[twrnc`absolute -top-10 -right-10 w-32 h-32 opacity-5`]}>
        <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
          {[...Array(16)].map((_, i) => (
            <View key={i} style={[twrnc`w-1/4 h-1/4 border border-[#FFC107]`, { transform: [{ rotate: "45deg" }] }]} />
          ))}
        </View>
      </View>

      <View style={twrnc`relative z-10`}>
        <View style={twrnc`flex-row items-center justify-between mb-3`}>
          <View style={twrnc`flex-row items-center`}>
            <View style={twrnc`w-0.5 h-4 bg-[#FFC107] rounded-full mr-2`} />
            <View>
              <CustomText weight="bold" style={twrnc`text-white text-sm`}>
                Badges
              </CustomText>
              <CustomText style={twrnc`text-gray-400 text-[9px]`}>{earnedCount} earned</CustomText>
            </View>
          </View>

          {badges.length > 0 && (
            <TouchableOpacity onPress={onViewAll} activeOpacity={0.7}>
              <View style={twrnc`flex-row items-center`}>
                <CustomText style={twrnc`text-[#4361EE] text-xs mr-1`}>View All</CustomText>
                <Ionicons name="chevron-forward" size={14} color="#4361EE" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {badges.length > 0 ? (
          <BadgeGrid badges={recentBadges} onBadgePress={onBadgePress} maxVisible={6} />
        ) : (
          <View style={twrnc`items-center py-8`}>
            <View style={twrnc`bg-[#0f172a] rounded-full p-4 mb-3`}>
              <Ionicons name="trophy-outline" size={32} color="#6B7280" />
            </View>
            <CustomText style={twrnc`text-gray-400 text-xs text-center`}>Complete quests to earn your first badge!</CustomText>
          </View>
        )}
      </View>
    </View>
  )
}

// All Badges Modal
export const AllBadgesModal = ({ visible, badges, onClose, onBadgePress }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0)
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start()
    }
  }, [visible])

  // Count actually earned badges for header
  const earnedCount = badges.filter(b => !b.locked).length;

  const categorizedBadges = badges.reduce((acc, badge) => {
    if (!acc[badge.category]) {
      acc[badge.category] = []
    }
    acc[badge.category].push(badge)
    return acc
  }, {})

  return (
    <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
      <View style={twrnc`flex-1 bg-black/50 justify-end`}>
        <Animated.View
          style={[
            twrnc`bg-[#1e293b] rounded-t-3xl h-5/6`,
            {
              opacity: fadeAnim,
            },
          ]}
        >
          <View style={twrnc`px-5 pt-5 pb-4 border-b border-gray-700`}>
            <View style={twrnc`flex-row items-center justify-between`}>
              <View style={twrnc`flex-row items-center flex-1`}>
                <View style={twrnc`w-1 h-6 bg-[#FFC107] rounded-full mr-3`} />
                <View>
                  <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                    All Badges
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 text-xs`}>{earnedCount} badges earned</CustomText>
                </View>
              </View>
              <TouchableOpacity style={twrnc`bg-[#0f172a] p-2 rounded-xl`} onPress={onClose} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={twrnc`flex-1 px-5 pt-4`} showsVerticalScrollIndicator={false}>
            {Object.keys(categorizedBadges).map((category) => (
              <View key={category} style={twrnc`mb-5`}>
                <View style={twrnc`bg-[#0f172a] rounded-xl px-4 py-2.5 mb-3 flex-row items-center`}>
                  <View style={twrnc`w-1 h-4 bg-[#4361EE] rounded-full mr-2.5`} />
                  <CustomText weight="bold" style={twrnc`text-white text-sm flex-1`}>
                    {category}
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 text-xs`}>{categorizedBadges[category].length}</CustomText>
                </View>

                <View style={twrnc`flex-row flex-wrap gap-3`}>
                  {categorizedBadges[category].map((badge) => (
                    <BadgeItem key={badge.id} badge={badge} size="medium" onPress={onBadgePress} />
                  ))}
                </View>
              </View>
            ))}

            {badges.length === 0 && (
              <View style={twrnc`items-center justify-center py-20`}>
                <View style={twrnc`bg-[#0f172a] rounded-full p-6 mb-4`}>
                  <Ionicons name="trophy-outline" size={48} color="#6B7280" />
                </View>
                <CustomText weight="bold" style={twrnc`text-gray-300 text-base mb-2 text-center`}>
                  No badges loaded
                </CustomText>
                <CustomText style={twrnc`text-gray-500 text-xs text-center`}>Complete quests to start earning badges!</CustomText>
              </View>
            )}

            <View style={twrnc`h-5`} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}