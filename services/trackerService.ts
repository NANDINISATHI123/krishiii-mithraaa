import { Outcome } from '../types';
import { supabase } from '../lib/supabaseClient';

/**
 * Fetches harvest outcomes for a specific user.
 * @param userId - The ID of the user whose outcomes to fetch.
 */
export const getOutcomes = async (userId: string): Promise<Outcome[]> => {
    const { data, error } = await supabase
        .from('outcomes')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching outcomes:', error.message);
        return [];
    }
    return data as Outcome[];
};

/**
 * Adds a new harvest outcome to the database.
 * @param outcomeData - The outcome data to be inserted.
 */
export const addOutcome = async (outcomeData: Omit<Outcome, 'id' | 'created_at'>): Promise<Outcome | null> => {
    const { data, error } = await supabase
        .from('outcomes')
        .insert(outcomeData)
        .select()
        .single();
    
    if (error) {
        console.error('Error adding outcome:', error.message);
        throw error; // Let the caller handle the error
    }
    return data as Outcome;
};

/**
 * Fetches all harvest outcomes (for admin view) via a secure RPC call.
 * NOTE: Requires a corresponding `get_all_outcomes_admin` function in the database.
 */
export const getAllOutcomes = async (): Promise<(Outcome & { profiles: { name: string, email: string } })[]> => {
    const { data, error } = await supabase.rpc('get_all_outcomes_admin');
    
    if (error) {
        console.error('Error fetching all outcomes via RPC:', error);
        return [];
    }
    return data as any[];
};