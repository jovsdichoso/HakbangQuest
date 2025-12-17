import { Modal, View, TouchableOpacity, TextInput, ActivityIndicator, FlatList, Animated } from "react-native"
import { useEffect, useRef } from "react"
import twrnc from "twrnc"
import CustomText from "../CustomText"
import { Ionicons } from "@expo/vector-icons"

const AddFriendModal = ({
    isVisible,
    onClose,
    searchQuery,
    setSearchQuery,
    searchLoading,
    searchResults,
    onSendRequest,
    sendingRequests = {},
    renderSearchResultItem,
}) => {
    // Animation refs
    const fadeAnim = useRef(new Animated.Value(0)).current
    const slideAnim = useRef(new Animated.Value(50)).current
    const searchBarAnim = useRef(new Animated.Value(0)).current

    // Trigger animations when modal becomes visible
    useEffect(() => {
        if (isVisible) {
            fadeAnim.setValue(0)
            slideAnim.setValue(50)
            searchBarAnim.setValue(0)

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

            Animated.timing(searchBarAnim, {
                toValue: 1,
                duration: 400,
                delay: 150,
                useNativeDriver: true,
            }).start()
        }
    }, [isVisible])

    const accentColor = "#4361EE"

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
                    <View style={[twrnc`h-1 mb-4 rounded-full overflow-hidden`, { backgroundColor: accentColor }]}>
                        <View style={twrnc`h-full flex-row`}>
                            {[...Array(20)].map((_, i) => (
                                <View 
                                    key={i} 
                                    style={[
                                        twrnc`flex-1`,
                                        { backgroundColor: i % 2 === 0 ? accentColor : `${accentColor}CC` }
                                    ]} 
                                />
                            ))}
                        </View>
                    </View>

                    {/* Header */}
                    <View style={twrnc`flex-row justify-between items-center mb-4`}>
                        <CustomText weight="bold" style={twrnc`text-white text-xl flex-1`}>
                            Find Friends
                        </CustomText>
                        <TouchableOpacity 
                            onPress={onClose}
                            accessibilityLabel="Close search"
                            style={[twrnc`p-2.5 rounded-xl`, { backgroundColor: `${accentColor}20` }]}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="close" size={20} color={accentColor} />
                        </TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <Animated.View 
                        style={[
                            twrnc`flex-row items-center bg-[#111827] rounded-xl px-4 py-3 mb-5`,
                            { opacity: searchBarAnim }
                        ]}
                    >
                        <Ionicons name="search-outline" size={20} color="#6B7280" />
                        <TextInput
                            style={twrnc`flex-1 text-white ml-3 text-base`}
                            placeholder="Search by name or username..."
                            placeholderTextColor="#6B7280"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus={true}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity 
                                onPress={() => setSearchQuery("")} 
                                activeOpacity={0.7}
                            >
                                <Ionicons name="close-circle" size={20} color="#6B7280" />
                            </TouchableOpacity>
                        )}
                    </Animated.View>

                    {/* Results */}
                    {searchLoading ? (
                        <View style={twrnc`items-center justify-center py-12`}>
                            <View style={[
                                twrnc`w-16 h-16 rounded-full items-center justify-center mb-4`,
                                { backgroundColor: `${accentColor}20` }
                            ]}>
                                <ActivityIndicator size="large" color={accentColor} />
                            </View>
                            <CustomText weight="semibold" style={twrnc`text-gray-400 text-sm`}>
                                Searching...
                            </CustomText>
                        </View>
                    ) : searchResults.length > 0 ? (
                        <FlatList
                            data={searchResults}
                            renderItem={renderSearchResultItem}
                            keyExtractor={(item) => item.id}
                            showsVerticalScrollIndicator={false}
                        />
                    ) : searchQuery.length > 0 ? (
                        /* No Results */
                        <View style={twrnc`items-center justify-center py-12`}>
                            <View style={twrnc`w-20 h-20 rounded-full bg-[#374151] items-center justify-center mb-4`}>
                                <Ionicons name="search-outline" size={40} color="#6B7280" />
                            </View>
                            <CustomText weight="bold" style={twrnc`text-white text-xl mb-2`}>
                                No Results Found
                            </CustomText>
                            <CustomText style={twrnc`text-gray-400 text-center text-sm`}>
                                No users found matching "{searchQuery}"
                            </CustomText>
                        </View>
                    ) : (
                        /* Empty State */
                        <View style={twrnc`items-center justify-center py-12`}>
                            <View style={twrnc`relative mb-6`}>
                                <View style={[
                                    twrnc`w-24 h-24 rounded-full items-center justify-center`,
                                    { backgroundColor: `${accentColor}20` }
                                ]}>
                                    <View style={[
                                        twrnc`w-20 h-20 rounded-full items-center justify-center`,
                                        { backgroundColor: `${accentColor}30` }
                                    ]}>
                                        <Ionicons name="people" size={40} color={accentColor} />
                                    </View>
                                </View>
                                {/* Floating Search Icon */}
                                <View style={[
                                    twrnc`absolute -bottom-2 -right-2 w-10 h-10 rounded-full items-center justify-center border-4 border-[#1F2937]`,
                                    { backgroundColor: accentColor }
                                ]}>
                                    <Ionicons name="search" size={20} color="#FFFFFF" />
                                </View>
                            </View>
                            <CustomText weight="bold" style={twrnc`text-white text-2xl mb-3 text-center`}>
                                Search for Friends
                            </CustomText>
                            <CustomText style={twrnc`text-gray-400 text-center text-sm px-8 leading-6`}>
                                Find friends by searching their name or username to connect and compete together
                            </CustomText>
                        </View>
                    )}
                </Animated.View>
            </View>
        </Modal>
    )
}

export default AddFriendModal
