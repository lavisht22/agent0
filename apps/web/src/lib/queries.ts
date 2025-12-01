import { queryOptions } from "@tanstack/react-query";
import { supabase } from "./supabase";

export const workspacesQuery = queryOptions({
    queryKey: ["workspaces"],
    queryFn: async () => {
        const { data, error } = await supabase.from("workspaces").select("*, workspace_user(*, users(*))");

        if (error) throw error;

        return data;
    },

})

export const providersQuery = (workspaceId: string) => queryOptions({
    queryKey: ["providers", workspaceId],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("providers")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return data;
    },
    enabled: !!workspaceId,
})

export const agentsQuery = (workspaceId: string) => queryOptions({
    queryKey: ["agents", workspaceId],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("agents")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return data;
    },
    enabled: !!workspaceId,
})

export const agentQuery = (agentId: string) => queryOptions({
    queryKey: ["agent", agentId],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("agents")
            .select("*")
            .eq("id", agentId)
            .single();

        if (error) throw error;

        return data;
    },
    enabled: !!agentId,
})

export const agentVersionsQuery = (agentId: string) => queryOptions({
    queryKey: ["agent-versions", agentId],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("versions")
            .select("*")
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return data;
    },
    enabled: !!agentId,
})

export const apiKeysQuery = (workspaceId: string) => queryOptions({
    queryKey: ["api-keys", workspaceId],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("api_keys")
            .select("*")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        return data;
    },
    enabled: !!workspaceId,
})

export const userQuery = queryOptions({
    queryKey: ['user'],
    queryFn: async () => {
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

        if (claimsError) throw claimsError;

        const claims = claimsData?.claims;

        if (!claims?.sub) throw new Error("User not found");

        const { data: user, error: userError } = await supabase.from("users").select("*").eq("id", claims.sub).single();

        if (userError) throw userError;

        return { claims, user };
    },
})