import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient.ts';
import { Session, User } from '@supabase/supabase-js';
import { translations } from '../lib/translations.ts';
import { Profile, Theme, FontSize, Language } from '../types.ts';
import { getQueuedActions, processActionQueue } from '../services/offlineService.ts';

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

    const t = useCallback((key: keyof typeof translations['en']): string => {
        return translations[language]?.[key] || translations['en'][key];
    }, [language]);

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
                setSyncSuccessMessage(t('sync_complete_refresh'));
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
    }, [refreshPendingCount, t]);

    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const currentSessionProfile = profile;
            setSession(session);
            const currentUser = session?.user ?? null;
            setUser(currentUser);

            if (currentUser) {
                if (currentSessionProfile?.id === currentUser.id) {
                    setAuthLoading(false);
                    return;
                }
                
                setProfileLoading(true);
                try {
                    const { data: profileData, error: fetchError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', currentUser.id)
                        .maybeSingle();

                    if (fetchError) throw fetchError;

                    if (profileData) {
                        setProfile(profileData);
                    } else if (_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') {
                        console.warn('No profile found for user on sign-in, creating one now.');
                        const { data: newProfile, error: insertError } = await supabase
                            .from('profiles')
                            .insert({
                                id: currentUser.id,
                                email: currentUser.email,
                                name: currentUser.user_metadata.name || currentUser.email,
                                role: 'employee'
                            })
                            .select()
                            .single();
                        
                        if (insertError) throw insertError;
                        setProfile(newProfile);
                    }
                } catch (error: any) {
                    console.error("Critical error in auth handler:", error.message);
                    await supabase.auth.signOut();
                } finally {
                    setProfileLoading(false);
                }
            } else {
                setProfile(null);
            }
            setAuthLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [refreshKey]); // Removed 'profile' dependency to prevent re-subscribing on profile changes.
    
    useEffect(() => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    useEffect(() => {
        localStorage.setItem('language', language);
    }, [language]);
    

    const toggleTheme = useCallback(() => {
        setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
    }, []);

    const refreshData = useCallback(() => setRefreshKey(k => k + 1), []);
    
    const value = useMemo(() => ({
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
        refreshData,
        refreshPendingCount,
        syncSuccessMessage,
        setSyncSuccessMessage,
        isSidebarOpen,
        setIsSidebarOpen,
    }), [
        session, user, profile, authLoading, profileLoading, theme, language, isOnline,
        pendingActionCount, syncSuccessMessage, isSidebarOpen, t, toggleTheme, setLanguage,
        refreshData, refreshPendingCount, setSyncSuccessMessage, setIsSidebarOpen
    ]);

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