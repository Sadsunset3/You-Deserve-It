export type SelectionSlots = [string | null, string | null];

export function placeCharacter(
  slots: SelectionSlots,
  characterId: string,
  slotIndex: 0 | 1,
): SelectionSlots {
  const nextSlots: SelectionSlots = [slots[0], slots[1]];
  const sourceIndex = slots[0] === characterId && slotIndex === 1 ? 0 :
    slots[1] === characterId && slotIndex === 0 ? 1 : -1;

  if (sourceIndex !== -1) {
    const targetCharacterId = slots[slotIndex];
    nextSlots[sourceIndex] = targetCharacterId;
  }

  nextSlots[slotIndex] = characterId;
  const otherSlotIndex = slotIndex === 0 ? 1 : 0;
  if (nextSlots[otherSlotIndex] === characterId) {
    nextSlots[otherSlotIndex] = null;
  }
  return nextSlots;
}

export function removeCharacter(
  slots: SelectionSlots,
  characterId: string,
): SelectionSlots {
  return [
    slots[0] === characterId ? null : slots[0],
    slots[1] === characterId ? null : slots[1],
  ];
}

export function selectedCharacterIds(slots: SelectionSlots): string[] {
  const selectedIds: string[] = [];

  for (const characterId of slots) {
    if (characterId !== null && !selectedIds.includes(characterId)) {
      selectedIds.push(characterId);
    }
  }

  return selectedIds;
}
