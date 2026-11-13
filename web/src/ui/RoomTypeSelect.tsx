import roomTypes from '../../../backend/data/interior/room-types.json';

export const defaultRoomType = roomTypes[0]!;
export function roomTypeColor(type: string, fallback = '#CCCCCC') {
  return roomTypes.find((entry) => entry.value === type)?.color ?? fallback;
}

export function RoomTypeSelect({ value, color, onChange }: {
  value: string; color: string; onChange: (type: string, color: string) => void;
}) {
  const selectedColor = roomTypeColor(value, color);
  return <label className="flex flex-col gap-2 text-sm text-slate-300">
    공간 타입
    <div className="flex items-center gap-3">
      <select value={value} onChange={(event) => onChange(event.target.value, roomTypeColor(event.target.value))} className="min-w-0 flex-1 rounded-lg border border-white/20 bg-[#141f32] px-3 py-2 text-sm text-white outline-accent">
        {!roomTypes.some((entry) => entry.value === value) && <option value={value}>기존 타입: {value || '미분류'}</option>}
        {roomTypes.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
      </select>
      <span title="타입에 지정된 색상" aria-label={`타입 색상 ${selectedColor}`} className="h-7 w-7 shrink-0 rounded-md border border-white/25" style={{ backgroundColor: selectedColor }} />
    </div>
    <span className="text-xs text-slate-500">선택한 타입의 색상이 자동 적용됩니다.</span>
  </label>;
}
