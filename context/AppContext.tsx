
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { translations, Language } from '../lib/translations';
import { Profile, Theme, FontSize } from '../types';
// FIX: Corrected import path.
import { getQueuedActions, processActionQueue } from '../services/offlineService';

interface AppContextType {
    session: Session | null;
    user: User | null;
    profile: Profile | null;
    authLoading: boolean;
    profileLoading: boolean;
    theme: Theme;
    toggleTheme: () => void;
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: keyof typeof translations['en']) => string;
    isOnline: boolean;
    pendingActionCount: number;
    refreshData: () => void;
    refreshPendingCount: () => void;
    syncSuccessMessage: string;
    setSyncSuccessMessage: (message: string) => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (isOpen: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [profileLoading, setProfileLoading] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingActionCount, setPendingActionCount] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);
    const [syncSuccessMessage, setSyncSuccessMessage] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('theme') as Theme;
        return savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    });

    const [language, setLanguage] = useState<Language>(() => {
        return (localStorage.getItem('language') as Language) || 'en';
    });

    const refreshPendingCount = useCallback(async () => {
        const actions = await getQueuedActions();
        setPendingActionCount(actions.length);
    }, []);

    useEffect(() => {
        refreshPendingCount();

        const handleOnline = async () => {
            setIsOnline(true);
            const synced = await processActionQueue();
            if (synced) {
                setSyncSuccessMessage(translations[language].sync_complete_refresh);
                setRefreshKey(prev => prev + 1);
            }
            await refreshPendingCount();
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [refreshPendingCount, language]);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);
            setProfile(null); // Reset profile during auth changes

            if (currentUser) {
                setProfileLoading(true);
                try {
                    // Attempt to fetch the user's profile
                    const { data: profileData, error: fetchError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', currentUser.id)
                        .maybeSingle(); // Use maybeSingle to get one record or null, without erroring on zero rows

                    if (fetchError) throw fetchError;

                    if (profileData) {
                        // Profile exists, set it in state
                        setProfile(profileData);
                    } else if (_event === 'SIGNED_IN') {
                        // This is a new sign-in and the profile does NOT exist.
                        // This self-heals the data by creating a profile for a user who might have been created before the trigger existed.
                        console.warn('No profile found for user on sign-in, creating one now.');
                        const { data: newProfile, error: insertError } = await supabase
                            .from('profiles')
                            .insert({
                                id: currentUser.id,
                                email: currentUser.email,
                                name: currentUser.user_metadata.name || currentUser.email, // Use metadata name or fallback to email
                                role: 'employee'
                            })
                            .select()
                            .single();
                        
                        if (insertError) throw insertError;
                        
                        // Set the newly created profile in state
                        setProfile(newProfile);
                    }
                } catch (error) {
                    console.error("Critical error in auth handler:", error);
                    setProfile(null);
                    setSession(null);
                    setUser(null);
                    await supabase.auth.signOut();
                } finally {
                    setProfileLoading(false);
                }
            }
            // The initial auth check is complete, allow the app to render.
            setAuthLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [refreshKey]);
    
    useEffect(() => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    useEffect(() => {
        localStorage.setItem('language', language);
    }, [language]);
    

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    };

    const t = (key: keyof typeof translations['en']): string => {
        return translations[language]?.[key] || translations['en'][key];
    };
    
    const value = {
        session,
        user,
        profile,
        authLoading,
        profileLoading,
        theme,
        toggleTheme,
        language,
        setLanguage,
        t,
        isOnline,
        pendingActionCount,
        refreshData: () => setRefreshKey(k => k + 1),
        refreshPendingCount: refreshPendingCount,
        syncSuccessMessage,
        setSyncSuccessMessage,
        isSidebarOpen,
        setIsSidebarOpen,
    };

    return (
        <AppContext.Provider value={value}>
            {!authLoading && children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppContextProvider');
    }
    return context;
};
