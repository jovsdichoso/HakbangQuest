import React, { useState, useEffect, useRef } from "react";
import {
    View,
    TouchableOpacity,
    Animated,
    Easing,
    Dimensions,
    Image,
    Platform,
    StatusBar
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import twrnc from "twrnc";
import CustomText from "../components/CustomText";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const { width, height } = Dimensions.get("window");

const StoryScreen = ({ navigation, route }) => {
    const params = route.params || {};
    const isIntro = params.isIntro || false;

    // 1. STORY SCRIPT
    const storyContent = isIntro
        ? [
            "Welcome to HakbangQuest!",
            "The city lights are fading...",
            "Only your movement can power them back up!",
            "Run to recharge the grid.",
            "Let's Save the City!"
        ]
        : [
            "Zone Cleared!",
            "The city grid is stabilizing.",
            "Your energy levels are rising.",
            "Proceed to the next sector."
        ];

    const [currentLineIndex, setCurrentLineIndex] = useState(0);
    const [displayedText, setDisplayedText] = useState("");
    const [isTyping, setIsTyping] = useState(false);

    // Animation Values
    const roadAnim = useRef(new Animated.Value(0)).current;

    // 2. TYPEWRITER EFFECT
    useEffect(() => {
        const textToType = storyContent[currentLineIndex];
        setDisplayedText("");
        setIsTyping(true);
        let charIndex = 0;

        const typingInterval = setInterval(() => {
            if (charIndex <= textToType.length) {
                setDisplayedText(textToType.slice(0, charIndex));
                charIndex++;
            } else {
                clearInterval(typingInterval);
                setIsTyping(false);
            }
        }, 35); // Typing speed

        return () => clearInterval(typingInterval);
    }, [currentLineIndex]);

    // 3. INFINITE SCROLL ANIMATION
    useEffect(() => {
        Animated.loop(
            Animated.timing(roadAnim, {
                toValue: 1,
                duration: 8000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();
    }, []);

    // Moves the background
    const translateX = roadAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -width],
    });

    // 4. INTERACTION
    const handlePress = () => {
        // If still typing, finish the line immediately
        if (isTyping) {
            setDisplayedText(storyContent[currentLineIndex]);
            setIsTyping(false);
            return;
        }
        // Move to next line or finish
        if (currentLineIndex < storyContent.length - 1) {
            setCurrentLineIndex((prev) => prev + 1);
        } else {
            finishStory();
        }
    };

    const finishStory = async () => {
        if (isIntro && auth.currentUser) {
            try {
                const userRef = doc(db, "users", auth.currentUser.uid);
                await updateDoc(userRef, { hasSeenIntro: true });
            } catch (error) {
                console.error("Error updating intro status:", error);
            }
        }
        navigation.navigate("dashboard");
    };

    return (
        // CHANGED: Root is now TouchableOpacity so tapping ANYWHERE works
        <TouchableOpacity
            style={twrnc`flex-1 bg-[#1a1b26]`}
            onPress={handlePress}
            activeOpacity={1} // Keeps opacity solid (no flashing on tap)
        >
            <StatusBar hidden />

            {/* --- GAME WORLD --- */}
            <View style={twrnc`flex-1 justify-end`}>

                {/* BACKGROUND LAYER 1: THE NIGHT CITY GIF */}
                <View style={twrnc`absolute top-0 left-0 w-full h-full`}>
                    <Image
                        source={require('../assets/story/city_night.gif')}
                        style={twrnc`w-full h-full opacity-60`}
                        resizeMode="cover"
                    />
                </View>

                {/* BACKGROUND LAYER 2: SCROLLING BUILDINGS */}
                <View style={twrnc`absolute bottom-0 w-full h-full overflow-hidden opacity-30`}>
                    <Animated.View style={[twrnc`flex-row w-[200%] h-full`, { transform: [{ translateX }] }]}>
                        <Image source={require('../assets/story/city_night.gif')} style={twrnc`w-[${width}px] h-full`} resizeMode="cover" />
                    </Animated.View>
                </View>

                {/* ROAD / FLOOR */}
                <View style={twrnc`h-20 w-full bg-[#111827] border-t-2 border-[#6366f1] z-10`}>
                    <Animated.View style={[twrnc`flex-row w-[200%] h-full items-center`, { transform: [{ translateX }] }]}>
                        {[...Array(20)].map((_, i) => (
                            <View key={i} style={twrnc`w-20 h-1 bg-gray-700/50 mr-20`} />
                        ))}
                    </Animated.View>
                </View>

                {/* --- CHARACTER --- */}
                <View style={twrnc`absolute bottom-5 left-10 z-20`}>
                    <Image
                        source={require('../assets/story/runner.gif')}
                        style={twrnc`w-50 h-50`}
                        resizeMode="contain"
                    />
                </View>
            </View>

            {/* --- DIALOG BOX --- */}
            {/* CHANGED: This is now a View (not a Touchable) because the Root handles the tap */}
            <View
                style={[
                    twrnc`absolute top-1/4 self-center w-[90%] z-50 bg-[#1F2937]/95 p-1`,
                    {
                        borderWidth: 2,
                        borderColor: '#6366f1',
                        borderRadius: 8,
                        shadowColor: "#6366f1",
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 10,
                        elevation: 10
                    }
                ]}
            >
                <View style={twrnc`p-5 min-h-[120px]`}>
                    <CustomText weight="bold" style={[twrnc`text-white text-base leading-6`, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                        {displayedText}
                        {isTyping && <CustomText style={twrnc`text-[#6366f1]`}>_</CustomText>}
                    </CustomText>
                </View>

                {!isTyping && (
                    <View style={twrnc`absolute bottom-2 right-4`}>
                        <Ionicons name="caret-down" size={20} color="#6366f1" />
                    </View>
                )}
            </View>

        </TouchableOpacity>
    );
};

export default StoryScreen;