"use client";

import { useState } from "react";
import { Images, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useSeries } from "@/context/SeriesContext";
import { useTrash } from "@/context/TrashContext";
import type { Character } from "@/lib/types";
import { addGalleryImages } from "@/lib/galleryDb";
import { readFileAsDataUrl } from "@/lib/files";
import CharacterModal, { type CharacterFormValues } from "./CharacterModal";
import CharacterGalleryModal from "./CharacterGalleryModal";
import ConfirmDialog from "./ConfirmDialog";

export default function CharacterSheetPanel({ seriesId }: { seriesId: string }) {
  const { getCharactersForSeries, addCharacter, updateCharacter, removeCharacter } = useSeries();
  const { captureCharacter } = useTrash();
  const characters = getCharactersForSeries(seriesId);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [galleryCharacter, setGalleryCharacter] = useState<Character | null>(null);
  const [characterPendingDelete, setCharacterPendingDelete] = useState<Character | null>(null);

  function openAddModal() {
    setEditingCharacter(null);
    setIsModalOpen(true);
  }

  function openEditModal(character: Character) {
    setEditingCharacter(character);
    setIsModalOpen(true);
  }

  // 새 캐릭터 등록 시 함께 올린 참조 이미지가 있으면, 캐릭터를 만든 직후(=진짜 id가
  // 생긴 직후) 그 id로 참조 이미지 갤러리에 한 번에 저장하고, 첫 장을 대표 프로필
  // 이미지로 지정한다 — "기본정보 등록 → 갤러리 관리"로 나뉘어 있던 2단계를 하나로 합침.
  async function handleSubmit(values: CharacterFormValues, referenceImages?: File[]) {
    if (editingCharacter) {
      updateCharacter(editingCharacter.id, values);
      setIsModalOpen(false);
      return;
    }

    const created = addCharacter(seriesId, values);
    setIsModalOpen(false);

    if (referenceImages && referenceImages.length > 0) {
      const uploaded = await addGalleryImages(created.id, referenceImages);
      if (uploaded[0]) {
        const dataUrl = await readFileAsDataUrl(uploaded[0].thumbnailBlob);
        updateCharacter(created.id, { profileImage: dataUrl });
      }
    }
  }

  async function handleConfirmDelete() {
    if (!characterPendingDelete) return;
    await captureCharacter(characterPendingDelete);
    removeCharacter(characterPendingDelete.id);
    setCharacterPendingDelete(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          등록한 캐릭터의 영문 외형 태그는 프롬프트 생성 화면에서 대사 화자명과 자동으로
          매칭되어 컷별 프롬프트에 반영됩니다.
        </p>
        <button
          onClick={openAddModal}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
        >
          <Plus className="h-4 w-4" />
          캐릭터 추가
        </button>
      </div>

      {characters.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          <UserRound className="h-8 w-8 text-slate-200" />
          아직 등록된 캐릭터가 없습니다.
          <br />
          &quot;캐릭터 추가&quot;로 이름과 외형 태그를 등록해보세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((character) => (
            <div
              key={character.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                  {character.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={character.profileImage}
                      alt={character.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserRound className="h-6 w-6 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {character.name}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {character.gender}
                    {character.role ? ` · ${character.role}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEditModal(character)}
                    title="수정"
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setCharacterPendingDelete(character)}
                    title="삭제"
                    className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[character.hairTag, character.eyeTag, character.outfitTag]
                  .filter(Boolean)
                  .map((tag, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                {!character.hairTag && !character.eyeTag && !character.outfitTag && (
                  <span className="text-[11px] text-slate-300">외형 태그 미입력</span>
                )}
              </div>

              <button
                onClick={() => setGalleryCharacter(character)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                <Images className="h-3.5 w-3.5" />
                참조 이미지 갤러리
              </button>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <CharacterModal
          initial={editingCharacter}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
          onOpenGallery={
            editingCharacter
              ? () => {
                  setIsModalOpen(false);
                  setGalleryCharacter(editingCharacter);
                }
              : undefined
          }
        />
      )}

      {galleryCharacter && (
        <CharacterGalleryModal
          character={galleryCharacter}
          onClose={() => setGalleryCharacter(null)}
          onSetProfileImage={(dataUrl) =>
            updateCharacter(galleryCharacter.id, { profileImage: dataUrl })
          }
        />
      )}

      {characterPendingDelete && (
        <ConfirmDialog
          title="캐릭터를 삭제할까요?"
          message={`"${characterPendingDelete.name}"와(과) 참조 이미지 전체가 휴지통으로 이동합니다. 휴지통에서 다시 복원할 수 있습니다.`}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setCharacterPendingDelete(null)}
        />
      )}
    </div>
  );
}
