import { CalendarTask, UserTaskStatus } from '../types.ts';
import { supabase } from '../lib/supabaseClient.ts';
import { mockCalendarTasks } from '../lib/data.ts';

// --- For Employees ---
export const getTasksForMonth = async (month: number): Promise<CalendarTask[]> => {
    const { data, error } = await supabase
        .from('calendar_tasks')
        .select('*')
        .eq('month', month)
        .order('day_of_month');
        
    if (error) {
        console.error('Error fetching calendar tasks, falling back to mock:', error.message);
        return mockCalendarTasks.filter(t => t.month === month);
    }
    if (!data || data.length === 0) {
        console.log('No calendar tasks in DB for this month, falling back to mock data for demonstration.');
        return mockCalendarTasks.filter(t => t.month === month);
    }
    return data;
};

export const getUserTaskStatuses = async (userId: string): Promise<UserTaskStatus[]> => {
    try {
        const { data, error } = await supabase
            .from('user_task_status')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            // This will catch errors like the table not existing.
            // We log it for developers but don't crash the app.
            console.warn('Could not fetch user task statuses:', error.message);
            return [];
        }
        return data;
    } catch (e: any) {
        console.error('A critical error occurred while fetching task statuses:', e.message);
        return [];
    }
};

export const updateTaskStatus = async (userId: string, taskId: string, isDone: boolean): Promise<UserTaskStatus | null> => {
    // Using RPC to call a SECURITY DEFINER function on the backend.
    // This is the correct way to handle writes that should be permitted by RLS policies.
    const { data, error } = await supabase.rpc('update_user_task_status', {
        p_user_id: userId,
        p_task_id: taskId,
        p_is_done: isDone,
    });
    
    if (error) {
        console.error('Error updating task status:', error.message);
        throw error;
    }
    return data;
};

// --- For Admins ---
export const getTasks = async (): Promise<CalendarTask[]> => {
    const { data, error } = await supabase.from('calendar_tasks').select('*').order('month').order('day_of_month');
    if (error) {
        console.error('Error fetching all tasks:', error.message);
        return [];
    }
    return data;
};

export const saveTask = async (task: Omit<CalendarTask, 'id' | 'created_at'>): Promise<CalendarTask | null> => {
    const { data, error } = await supabase.from('calendar_tasks').insert(task).select().single();
    if (error) {
        console.error('Error saving task:', error.message);
        return null;
    }
    return data;
};

export const updateTask = async (task: CalendarTask): Promise<CalendarTask | null> => {
    const { data, error } = await supabase.from('calendar_tasks').update(task).eq('id', task.id).select().single();
    if (error) {
        console.error('Error updating task:', error.message);
        return null;
    }
    return data;
};

export const deleteTask = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('calendar_tasks').delete().eq('id', id);
    if (error) {
        console.error('Error deleting task:', error.message);
        return false;
    }
    return true;
};