"use client"

import { useState, useEffect } from "react"
import { View, Modal, TouchableOpacity, FlatList, ActivityIndicator, Animated } from "react-native"
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore"
import { auth, db } from "../firebaseConfig"
import twrnc from "twrnc"
import CustomText from "./CustomText"
import { FontAwesome } from "@expo/vector-icons"
import CustomModal from "./CustomModal"

const NotificationDropdown = ({ visible, onClose, navigateToActivity, navigateToCommunity }) => {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [slideAnim] = useState(new Animated.Value(-300))
  const [fadeAnim] = useState(new Animated.Value(0))

  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false)
  const [modalData, setModalData] = useState({
    title: "",
    message: "",
    type: "error",
    buttons: [],
    targetNotificationId: null,
  })

  useEffect(() => {
    if (visible) {
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
      slideAnim.setValue(-300)
      fadeAnim.setValue(0)
      setIsDeleteModalVisible(false)
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

  const deleteNotification = async (notificationId) => {
    try {
      await deleteDoc(doc(db, "notifications", notificationId))
    } catch (err) {
      console.error("Error deleting notification:", err)
    }
  }

  const deleteAllNotifications = async () => {
    try {
      const deletePromises = notifications.map((notification) => {
        const notificationRef = doc(db, "notifications", notification.id)
        return deleteDoc(notificationRef)
      })
      await Promise.all(deletePromises)
    } catch (err) {
      console.error("Error deleting all notifications:", err)
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

  const handleDeletePress = (notification) => {
    setModalData({
      title: "Delete Notification",
      message: "Are you sure you want to delete this notification?",
      type: "error",
      targetNotificationId: notification.id,
      buttons: [
        { label: "Cancel", style: "secondary", action: () => {} },
        { label: "Delete", style: "danger", action: () => deleteNotification(notification.id) },
      ],
    })
    setIsDeleteModalVisible(true)
  }

  const handleDeleteAllPress = () => {
    setModalData({
      title: "Delete ALL Notifications",
      message: `Are you sure you want to delete all ${notifications.length} notifications? This action cannot be undone.`,
      type: "warning",
      targetNotificationId: null,
      buttons: [
        { label: "Cancel", style: "secondary", action: () => {} },
        { label: `Delete All`, style: "danger", action: deleteAllNotifications },
      ],
    })
    setIsDeleteModalVisible(true)
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
        return "heartbeat"
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
        return "#EF476F"
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
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.8}
        style={twrnc`mx-4 mb-3`}
      >
        <View 
          style={[
            twrnc`flex-row items-start p-4 bg-[#1F2937] rounded-2xl overflow-hidden`,
            !item.read && { borderLeftWidth: 3, borderLeftColor: getNotificationColor(item.type) }
          ]}
        >
          {/* Unread Indicator Strip */}
          {!item.read && (
            <View style={twrnc`absolute top-0 left-0 right-0 h-0.5 flex-row`}>
              {[...Array(20)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    twrnc`flex-1 h-full`,
                    { backgroundColor: i % 2 === 0 ? getNotificationColor(item.type) : `${getNotificationColor(item.type)}80` }
                  ]}
                />
              ))}
            </View>
          )}

          {/* Icon Container - More compact */}
          <View style={twrnc`relative mr-3`}>
            <View 
              style={[
                twrnc`w-10 h-10 rounded-xl items-center justify-center`,
                { backgroundColor: `${getNotificationColor(item.type)}20` }
              ]}
            >
              <FontAwesome
                name={getNotificationIcon(item.type)}
                size={18}
                color={getNotificationColor(item.type)}
              />
            </View>
            {!item.read && (
              <View 
                style={[
                  twrnc`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2`,
                  { 
                    backgroundColor: getNotificationColor(item.type),
                    borderColor: '#1F2937'
                  }
                ]} 
              />
            )}
          </View>

          {/* Content */}
          <View style={twrnc`flex-1`}>
            <CustomText
              weight={!item.read ? "bold" : "semibold"}
              style={twrnc`text-white text-sm mb-1`}
            >
              {item.title}
            </CustomText>

            <CustomText style={twrnc`text-gray-400 text-xs mb-2 leading-4`}>
              {item.message}
            </CustomText>

            <View style={twrnc`flex-row items-center justify-between`}>
              <CustomText style={twrnc`text-gray-500 text-[10px]`}>
                {formatTimeAgo(item.createdAt)}
              </CustomText>

              <View style={twrnc`flex-row items-center`}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation()
                    handleDeletePress(item)
                  }}
                  style={[
                    twrnc`px-2 py-1 rounded-lg mr-2`,
                    { backgroundColor: '#EF444420' }
                  ]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="trash" size={12} color="#EF4444" />
                </TouchableOpacity>

                <FontAwesome name="chevron-right" size={10} color="#6B7280" />
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
    <>
      <Modal visible={visible} transparent={true} animationType="none" onRequestClose={onClose}>
        <TouchableOpacity
          style={twrnc`flex-1 bg-black bg-opacity-70`}
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
            <View style={twrnc`bg-[#111827] rounded-3xl shadow-2xl overflow-hidden`}>
              {/* Header with Gradient-like Effect */}
              <View style={twrnc`bg-[#1F2937] p-5 relative overflow-hidden`}>
                {/* Decorative Pattern */}
                <View style={twrnc`absolute top-0 right-0 w-32 h-32 opacity-5`}>
                  <View style={twrnc`absolute inset-0 flex-row flex-wrap`}>
                    {[...Array(16)].map((_, i) => (
                      <View
                        key={i}
                        style={[
                          twrnc`w-1/4 h-1/4 border border-[#4361EE]`,
                          { transform: [{ rotate: '45deg' }] }
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Top accent strip */}
                <View style={twrnc`absolute top-0 left-0 right-0 h-1 flex-row`}>
                  {[...Array(30)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        twrnc`flex-1 h-full`,
                        { backgroundColor: i % 2 === 0 ? '#4361EE' : '#7209B7' }
                      ]}
                    />
                  ))}
                </View>

                <View style={twrnc`flex-row justify-between items-center z-10`}>
                  <View style={twrnc`flex-row items-center flex-1`}>
                    <View style={twrnc`w-1 h-8 bg-[#4361EE] rounded-full mr-3`} />
                    <View>
                      <CustomText weight="bold" style={twrnc`text-white text-lg`}>
                        Notifications
                      </CustomText>
                      {unreadCount > 0 && (
                        <CustomText style={twrnc`text-gray-400 text-xs`}>
                          {unreadCount} unread
                        </CustomText>
                      )}
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={onClose}
                    style={[
                      twrnc`w-9 h-9 rounded-xl items-center justify-center`,
                      { backgroundColor: '#374151' }
                    ]}
                    activeOpacity={0.8}
                  >
                    <FontAwesome name="times" size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                {/* Action Buttons - Compact */}
                {(hasUnreadNotifications || notifications.length > 0) && (
                  <View style={twrnc`flex-row mt-4 z-10`}>
                    {hasUnreadNotifications && (
                      <TouchableOpacity
                        onPress={markAllAsRead}
                        style={[
                          twrnc`rounded-xl px-3 py-1.5 mr-2`,
                          { backgroundColor: '#4361EE30' }
                        ]}
                        activeOpacity={0.8}
                      >
                        <CustomText weight="semibold" style={twrnc`text-[#4361EE] text-xs`}>
                          Mark all read
                        </CustomText>
                      </TouchableOpacity>
                    )}

                    {notifications.length > 0 && (
                      <TouchableOpacity
                        onPress={handleDeleteAllPress}
                        style={[
                          twrnc`rounded-xl px-3 py-1.5`,
                          { backgroundColor: '#EF444430' }
                        ]}
                        activeOpacity={0.8}
                      >
                        <CustomText weight="semibold" style={twrnc`text-[#EF4444] text-xs`}>
                          Delete all
                        </CustomText>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Content */}
              <View style={twrnc`max-h-96 bg-[#111827]`}>
                {loading ? (
                  <View style={twrnc`items-center justify-center py-12`}>
                    <View style={twrnc`relative mb-4`}>
                      <View 
                        style={[
                          twrnc`absolute inset-0 rounded-full`,
                          { 
                            backgroundColor: '#4361EE',
                            opacity: 0.1,
                            transform: [{ scale: 1.3 }]
                          }
                        ]} 
                      />
                      <View 
                        style={[
                          twrnc`w-16 h-16 rounded-2xl items-center justify-center`,
                          { backgroundColor: '#4361EE20' }
                        ]}
                      >
                        <ActivityIndicator size="large" color="#4361EE" />
                      </View>
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-base mb-1`}>
                      Loading notifications
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs text-center px-6`}>
                      Fetching your latest updates
                    </CustomText>
                  </View>
                ) : error ? (
                  <View style={twrnc`items-center justify-center py-12`}>
                    <View 
                      style={[
                        twrnc`w-16 h-16 rounded-2xl items-center justify-center mb-4`,
                        { backgroundColor: '#EF444420' }
                      ]}
                    >
                      <FontAwesome name="exclamation-circle" size={32} color="#EF4444" />
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-base mb-1`}>
                      Something went wrong
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs text-center px-6`}>
                      {error}
                    </CustomText>
                  </View>
                ) : !Array.isArray(notifications) || notifications.length === 0 ? (
                  <View style={twrnc`items-center justify-center py-12`}>
                    <View style={twrnc`relative mb-4`}>
                      <View 
                        style={[
                          twrnc`absolute inset-0 rounded-full`,
                          { 
                            backgroundColor: '#6B7280',
                            opacity: 0.1,
                            transform: [{ scale: 1.3 }]
                          }
                        ]} 
                      />
                      <View 
                        style={[
                          twrnc`w-16 h-16 rounded-2xl items-center justify-center`,
                          { backgroundColor: '#37415120' }
                        ]}
                      >
                        <FontAwesome name="bell-slash" size={32} color="#6B7280" />
                      </View>
                    </View>
                    <CustomText weight="bold" style={twrnc`text-white text-base mb-1`}>
                      No notifications yet
                    </CustomText>
                    <CustomText style={twrnc`text-gray-400 text-xs text-center px-6`}>
                      New updates will appear here
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

              {/* Bottom accent line */}
              <View style={twrnc`h-1 flex-row`}>
                {[...Array(20)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      twrnc`flex-1 h-full`,
                      { backgroundColor: i % 2 === 0 ? '#4361EE40' : '#7209B740' }
                    ]}
                  />
                ))}
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      <CustomModal
        visible={isDeleteModalVisible}
        onClose={() => setIsDeleteModalVisible(false)}
        title={modalData.title}
        message={modalData.message}
        type={modalData.type}
        buttons={modalData.buttons.map(button => ({
          ...button,
          action: () => {
            const result = button.action()
            setIsDeleteModalVisible(false)
            return result
          }
        }))}
      />
    </>
  )
}

export default NotificationDropdown