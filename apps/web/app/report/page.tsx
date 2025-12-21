export default function ReportPage() {
  return (
    <div className="min-h-screen bg-pearl p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-lilac-dark">탱글 점수 결과</h1>

        <div className="bg-white shadow-glow rounded-xl p-6 space-y-4">
          <p className="text-gray-600 text-sm">오늘의 피부 탄력 점수</p>
          <p className="text-5xl font-bold text-lilac-dark">82</p>
        </div>

        <div className="bg-white shadow-glow rounded-xl p-6">
          <h2 className="text-lilac-dark font-semibold mb-3">세부 항목</h2>

          <div className="space-y-4">
            <Item label="광채" score={78} />
            <Item label="탄력" score={85} />
            <Item label="건조도" score={62} />
            <Item label="주름" score={70} />
          </div>
        </div>
      </div>
    </div>
  );
}

type ItemProps = {
  label: string;
  score: number;
};

function Item({ label, score }: ItemProps) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="text-gray-900 font-medium">{score}</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          style={{ width: `${score}%` }}
          className="h-full bg-lilac-dark"
        ></div>
      </div>
    </div>
  );
}
