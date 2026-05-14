'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Language = 'en' | 'pl';

interface Translations {
    [key: string]: string;
}

const dictionaries: Record<Language, Translations> = {
    en: {
        'welcome': 'Welcome to Yusen',
        'welcome_desc': 'Create a room to watch YouTube videos in sync with your friends. No account required.',
        'create_room': 'Create Room',
        'join_room': 'Join Room',
        'select_role': 'Select your role for this session.',
        'join_watcher': 'Join as Watcher',
        'join_watcher_desc': 'Plays video and audio. Connects to the TV or main screen.',
        'join_assistant': 'Join as Remote Control',
        'join_assistant_desc': 'Remote control. Manages the queue and playback.',
        'back_home': 'Back to Home',
        'remote_control': 'Remote Control',
        'loading': 'Loading...',
        'unknown': 'Unknown',
        'nothing_playing_assistant': 'Nothing is playing. Add a video to the queue!',
        'queue': 'Queue',
        'hide_queue': 'Hide Queue',
        'show_queue': 'Show Queue',
        'invite': 'Invite',
        'nothing_playing_watcher': 'No video playing. Add one from the queue!',
        'paste_url': 'Paste YouTube URL here...',
        'add': 'Add',
        'queue_empty': 'Queue is empty.',
        'no_metadata': 'No metadata available',
        'invite_friends': 'Invite Friends',
        'copied': 'Copied!',
        'copy_link': 'Copy link',
        'invalid_url': 'Invalid YouTube URL',
    },
    pl: {
        'welcome': 'Witamy w Yusen',
        'welcome_desc': 'Utwórz pokój, aby oglądać filmy na YouTube ze znajomymi. Konto nie jest wymagane.',
        'create_room': 'Utwórz pokój',
        'join_room': 'Dołącz do pokoju',
        'select_role': 'Wybierz swoją rolę na tę sesję.',
        'join_watcher': 'Dołącz jako ekran',
        'join_watcher_desc': 'Odtwarza obraz i dźwięk. Przeznaczony dla telewizora lub głównego ekranu.',
        'join_assistant': 'Dołącz jako pilot',
        'join_assistant_desc': 'Zdalne sterowanie. Zarządza kolejką i odtwarzaniem.',
        'back_home': 'Wróć na stronę główną',
        'remote_control': 'Pilot',
        'loading': 'Ładowanie...',
        'unknown': 'Nieznany',
        'nothing_playing_assistant': 'Nic nie jest odtwarzane. Dodaj wideo do kolejki!',
        'queue': 'Kolejka',
        'hide_queue': 'Ukryj kolejkę',
        'show_queue': 'Pokaż kolejkę',
        'invite': 'Zaproś',
        'nothing_playing_watcher': 'Nic nie jest odtwarzane. Dodaj wideo z kolejki!',
        'paste_url': 'Wklej link do YouTube tutaj...',
        'add': 'Dodaj',
        'queue_empty': 'Kolejka jest pusta.',
        'no_metadata': 'Brak metadanych',
        'invite_friends': 'Zaproś znajomych',
        'copied': 'Skopiowano!',
        'copy_link': 'Skopiuj link',
        'invalid_url': 'Nieprawidłowy link YouTube',
    }
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: keyof typeof dictionaries['en']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('en');

    useEffect(() => {
        const stored = localStorage.getItem('language') as Language;
        if (stored && dictionaries[stored]) {
            setLanguageState(stored);
        } else {
            const browserLang = navigator.language.split('-')[0];
            if (browserLang === 'pl') {
                setLanguageState('pl');
            } else {
                setLanguageState('en');
            }
        }
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
    };

    const t = (key: keyof typeof dictionaries['en']): string => {
        return dictionaries[language][key] || dictionaries['en'][key] || (key as string);
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useTranslation must be used within a LanguageProvider');
    }
    return context;
}
