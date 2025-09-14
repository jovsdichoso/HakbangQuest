"use client"

import { useState, useEffect } from "react"
import { View, Modal, TouchableOpacity, FlatList, ActivityIndicator, Animated } from "react-native"
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore"
import { auth, db } from "../firebaseConfig"
import twrnc from "twrnc"
import CustomText from "./CustomText"
import { FontAwesome } from "@expo/vector-icons"

const DEFAULT_AVATAR = "https://res.cloudinary.com/dljywnlvh/image/upload/v1747077348/default-avatar_jkbpwv.jpg"

const NotificationDropdown = ({ visible, onClose, navigateToActivity, navigateToCommunity }) => {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [slideAnim] = useState(new Animated.Value(-300))
  const [fadeAnim] = useState(new Animated.Value(0))

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      // Reset animation values
      slideAnim.setValue(-300)
      fadeAnim.setValue(0)
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return

    const user = auth.currentUser
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Set up real-time listener for notifications
    const notificationsRef = collection(db, "notifications")
    const notificationsQuery = query(
      notificationsRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    )

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (querySnapshot) => {
        try {
          const notificationsList = querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
          }))
          setNotifications(notificationsList)
          setLoading(false)
        } catch (err) {
          console.error("Error processing notifications:", err)
          setError("Failed to load notifications")
          setLoading(false)
        }
      },
      (err) => {
        console.error("Error in notifications listener:", err)
        setError("Failed to load notifications")
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [visible])

  const markAsRead = async (notificationId) => {
    try {
      const notificationRef = doc(db, "notifications", notificationId)
      await updateDoc(notificationRef, {
        read: true,
        readAt: new Date(),
      })
    } catch (err) {
      console.error("Error marking notification as read:", err)
    }
  }

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter((n) => !n.read)
      const updatePromises = unreadNotifications.map((notification) => {
        const notificationRef = doc(db, "notifications", notification.id)
        return updateDoc(notificationRef, {
          read: true,
          readAt: new Date(),
        })
      })
      await Promise.all(updatePromises)
    } catch (err) {
      console.error("Error marking all notifications as read:", err)
    }
  }

  const handleNotificationPress = async (notification) => {
    if (!notification.read) {
      await markAsRead(notification.id)
    }

    switch (notification.type) {
      case "friendRequest":
      case "challenge":
      case "message":
        onClose()
        navigateToCommunity()
        break
      case "activity":
        onClose()
        navigateToActivity()
        break
      default:
        onClose()
        break
    }
  }

  const formatTimeAgo = (date) => {
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case "friendRequest":
        return "user-plus"
      case "message":
        return "comment"
      case "challenge":
        return "trophy"
      case "activity":
        return "running"
      default:
        return "bell"
    }
  }

  const getNotificationColor = (type) => {
    switch (type) {
      case "friendRequest":
        return "#06D6A0"
      case "message":
        return "#4361EE"
      case "challenge":
        return "#FFC107"
      case "activity":
        return "#FF6B6B"
      default:
        return "#4361EE"
    }
  }

  const renderNotificationItem = ({ item, index }) => (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [
            {
              translateX: slideAnim.interpolate({
                inputRange: [-300, 0],
                outputRange: [-50, 0],
              }),
            },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={twrnc`mx-4 mb-3 p-4 bg-[#2A2E3A] rounded-2xl shadow-lg ${
          !item.read ? "border-l-4 border-[#4361EE]" : ""
        }`}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.8}
      >
        <View style={twrnc`flex-row items-start`}>
          {/* Icon Container */}
          <View
            style={twrnc`w-12 h-12 rounded-full items-center justify-center mr-4`}
            backgroundColor={getNotificationColor(item.type) + "20"}
          >
            <FontAwesome
              name={getNotificationIcon(item.type)}
              size={20}
              color={getNotificationColor(item.type)}
            />
          </View>

          {/* Content */}
          <View style={twrnc`flex-1`}>
            <View style={twrnc`flex-row items-start justify-between mb-2`}>
              <CustomText
                weight={!item.read ? "bold" : "semibold"}
                style={twrnc`text-white text-base flex-1 mr-2`}
              >
                {item.title}
              </CustomText>
              {!item.read && (
                <View style={twrnc`w-3 h-3 bg-[#4361EE] rounded-full mt-1`} />
              )}
            </View>

            <CustomText style={twrnc`text-gray-300 text-sm mb-3 leading-5`}>
              {item.message}
            </CustomText>

            <View style={twrnc`flex-row items-center justify-between`}>
              <CustomText style={twrnc`text-gray-400 text-xs`}>
                {formatTimeAgo(item.createdAt)}
              </CustomText>
              
              {/* Action indicator */}
              <View style={twrnc`flex-row items-center`}>
                <FontAwesome name="chevron-right" size={12} color="#6B7280" />
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )

  const hasUnreadNotifications =
    Array.isArray(notifications) && notifications.some((notification) => !notification.read)

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <Modal visible={visible} transparent={true} animationType="none" onRequestClose={onClose}>
      <TouchableOpacity
        style={twrnc`flex-1 bg-black bg-opacity-60`}
        activeOpacity={1}
        onPress={onClose}
      >
        <Animated.View
          style={[
            twrnc`absolute top-16 right-4 left-4 max-h-[80%]`,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Main Container */}
          <View style={twrnc`bg-[#1A1D29] rounded-2xl shadow-2xl overflow-hidden`}>
            {/* Header */}
            <View style={twrnc`bg-gradient-to-r from-[#4361EE] to-[#7209B7] p-6`}>
              <View style={twrnc`flex-row justify-between items-center`}>
                <View style={twrnc`flex-row items-center`}>
                  <View style={twrnc`w-10 h-10 bg-white bg-opacity-20 rounded-full items-center justify-center mr-3`}>
                    <FontAwesome name="bell" size={20} color="#FFFFFF" />
                  </View>
                  <View>
                    <CustomText weight="bold" style={twrnc`text-white text-xl`}>
                      Notifications
                    </CustomText>
                    {unreadCount > 0 && (
                      <CustomText style={twrnc`text-blue-100 text-sm`}>
                        {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
                      </CustomText>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  style={twrnc`w-10 h-10 bg-white bg-opacity-20 rounded-full items-center justify-center`}
                >
                  <FontAwesome name="times" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Mark All Read Button */}
              {hasUnreadNotifications && (
                <TouchableOpacity
                  onPress={markAllAsRead}
                  style={twrnc`mt-4 bg-white bg-opacity-20 rounded-xl px-4 py-2 self-start`}
                >
                  <CustomText weight="semibold" style={twrnc`text-white text-sm`}>
                    Mark all as read
                  </CustomText>
                </TouchableOpacity>
              )}
            </View>

            {/* Content */}
            <View style={twrnc`max-h-96`}>
              {loading ? (
                <View style={twrnc`items-center justify-center py-12`}>
                  <View style={twrnc`w-16 h-16 bg-[#4361EE] bg-opacity-20 rounded-full items-center justify-center mb-4`}>
                    <ActivityIndicator size="large" color="#4361EE" />
                  </View>
                  <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
                    Loading notifications
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 text-center px-6`}>
                    Please wait while we fetch your latest updates
                  </CustomText>
                </View>
              ) : error ? (
                <View style={twrnc`items-center justify-center py-12`}>
                  <View style={twrnc`w-16 h-16 bg-red-500 bg-opacity-20 rounded-full items-center justify-center mb-4`}>
                    <FontAwesome name="exclamation-circle" size={32} color="#EF4444" />
                  </View>
                  <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
                    Something went wrong
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 text-center px-6`}>
                    {error}
                  </CustomText>
                </View>
              ) : !Array.isArray(notifications) || notifications.length === 0 ? (
                <View style={twrnc`items-center justify-center py-12`}>
                  <View style={twrnc`w-16 h-16 bg-gray-500 bg-opacity-20 rounded-full items-center justify-center mb-4`}>
                    <FontAwesome name="bell-slash" size={32} color="#6B7280" />
                  </View>
                  <CustomText weight="semibold" style={twrnc`text-white text-lg mb-2`}>
                    No notifications yet
                  </CustomText>
                  <CustomText style={twrnc`text-gray-400 text-center px-6`}>
                    When you have new updates, they'll appear here
                  </CustomText>
                </View>
              ) : (
                <FlatList
                  data={notifications}
                  renderItem={renderNotificationItem}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  style={twrnc`py-4`}
                  contentContainerStyle={twrnc`pb-4`}
                />
              )}
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  )
}

export default NotificationDropdown
