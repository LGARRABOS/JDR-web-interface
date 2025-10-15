import React from 'react';
import { useAuth } from '../App.jsx';

const CharacterCard = ({ character, onEdit }) => {
  const { user } = useAuth();
  const isMJ = user?.isGameMaster;

  return (
    <div className="bg-slate-800/70 border border-slate-700 rounded-lg p-4 flex gap-4">
      {character.imageUrl ? (
        <img
          src={character.imageUrl}
          alt={character.name}
          className="w-20 h-20 rounded object-cover"
        />
      ) : (
        <div className="w-20 h-20 rounded bg-slate-700 flex items-center justify-center text-slate-400">
          {character.name.charAt(0)}
        </div>
      )}
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-slate-100">{character.name}</h3>
        <p className="text-sm text-slate-300">PV : {character.health}</p>
        <p className="text-sm text-slate-300">Mana : {character.mana}</p>
        {isMJ && (
          <button
            onClick={() => onEdit(character)}
            className="mt-2 text-sm text-accent hover:underline"
          >
            Modifier
          </button>
        )}
      </div>
    </div>
  );
};

export default CharacterCard;
