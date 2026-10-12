"use client";

/**
 * Every server call the app makes, as a hook.
 *
 * TanStack Query owns the fetching, caching and refetching. Keeping the calls here (rather than
 * inline in components) means the cache keys are written down once: when a call ends and we
 * invalidate the history, the characters and the usage, those are three names in one file
 * instead of three magic strings in three screens.
 *
 * Mutations invalidate what they changed, so the phone never shows a stale number.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Character,
  CharacterDraft,
  EndedCall,
  RememberedCard,
  SessionDetail,
  SessionListItem,
  Setup,
  StartedCall,
  Usage,
} from "./types";

export const keys = {
  characters: ["characters"] as const,
  character: (id: string) => ["characters", id] as const,
  remembered: (id: string) => ["characters", id, "remember"] as const,
  sessions: ["sessions"] as const,
  session: (id: string) => ["sessions", id] as const,
  usage: ["usage"] as const,
  setup: ["setup"] as const,
};

// ------------------------------------------------------------------ characters

export function useCharacters(): UseQueryResult<Character[]> {
  return useQuery({
    queryKey: keys.characters,
    queryFn: ({ signal }) => api.get<Character[]>("/characters", signal),
  });
}

export function useCharacter(id: string | undefined): UseQueryResult<Character> {
  return useQuery({
    queryKey: keys.character(id ?? ""),
    queryFn: ({ signal }) => api.get<Character>(`/characters/${id}`, signal),
    enabled: id !== undefined && id.length > 0,
  });
}

/** What the friend remembers from the last call. Shown before a call starts. */
export function useRemembered(id: string | undefined): UseQueryResult<RememberedCard> {
  return useQuery({
    queryKey: keys.remembered(id ?? ""),
    queryFn: ({ signal }) => api.get<RememberedCard>(`/characters/${id}/remember`, signal),
    enabled: id !== undefined && id.length > 0,
  });
}

export function useCreateCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: CharacterDraft) => api.post<Character>("/characters", draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.characters });
    },
  });
}

export function useUpdateCharacter(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: Partial<CharacterDraft>) => api.patch<Character>(`/characters/${id}`, draft),
    onSuccess: (character) => {
      queryClient.setQueryData(keys.character(id), character);
      void queryClient.invalidateQueries({ queryKey: keys.characters });
    },
  });
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/characters/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.characters });
      void queryClient.invalidateQueries({ queryKey: keys.sessions });
    },
  });
}

// ------------------------------------------------------------------ calls

export function useStartCall() {
  return useMutation({
    mutationFn: (input: { characterId: string; continueFromLast?: boolean }) =>
      api.post<StartedCall>("/calls", input),
  });
}

export function useEndCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { sessionId: string; durationSec?: number; summarise?: boolean }) =>
      api.post<EndedCall>(`/calls/${input.sessionId}/end`, {
        durationSec: input.durationSec,
        summarise: input.summarise,
      }),
    onSuccess: (ended) => {
      void queryClient.invalidateQueries({ queryKey: keys.sessions });
      void queryClient.invalidateQueries({ queryKey: keys.session(ended.sessionId) });
      void queryClient.invalidateQueries({ queryKey: keys.usage });
    },
  });
}

// ------------------------------------------------------------------ history

export function useSessions(limit = 50): UseQueryResult<SessionListItem[]> {
  return useQuery({
    queryKey: [...keys.sessions, limit],
    queryFn: ({ signal }) => api.get<SessionListItem[]>(`/sessions?limit=${limit}`, signal),
  });
}

export function useSession(id: string | undefined): UseQueryResult<SessionDetail> {
  return useQuery({
    queryKey: keys.session(id ?? ""),
    queryFn: ({ signal }) => api.get<SessionDetail>(`/sessions/${id}`, signal),
    enabled: id !== undefined && id.length > 0,
  });
}

// ------------------------------------------------------------------ settings

export function useUsage(): UseQueryResult<Usage> {
  return useQuery({
    queryKey: keys.usage,
    queryFn: ({ signal }) => api.get<Usage>("/usage", signal),
  });
}

/**
 * The setup checklist. Retries are off: if the API is not up yet, hammering it does not help,
 * and the screen that shows this is the one you land on when something is wrong.
 */
export function useSetup(): UseQueryResult<Setup> {
  return useQuery({
    queryKey: keys.setup,
    queryFn: ({ signal }) => api.get<Setup>("/setup", signal),
    retry: false,
  });
}
