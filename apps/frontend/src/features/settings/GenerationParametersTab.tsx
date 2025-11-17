"use client";

import { useEffect, useState } from "react";
import { useClientSettings } from "@/hooks/useClientSettings";
import { useUpdateClientSettings } from "@/hooks/useUpdateClientSettings";
import { Slider } from "../../components/ui/Slider";

interface GenerationParametersTabProps {
	clientId: string;
	onSaveSuccess: () => void;
	onSaveError: (message: string) => void;
}

interface GenerationParams {
	do_sample: boolean;
	temperature: number;
	top_p: number;
	top_k: number;
	repetition_penalty: number;
	max_tokens: number;
}

const DEFAULT_PARAMS: GenerationParams = {
	do_sample: false,
	temperature: 0.7,
	top_p: 0.9,
	top_k: 50,
	repetition_penalty: 1.1,
	max_tokens: 2048,
};

export function GenerationParametersTab({
	clientId,
	onSaveSuccess,
	onSaveError,
}: Readonly<GenerationParametersTabProps>) {
	const { data: clientData } = useClientSettings(clientId);
	const updateMutation = useUpdateClientSettings();

	const [params, setParams] = useState<GenerationParams>(DEFAULT_PARAMS);

	// Initialize from client data
	useEffect(() => {
		if (clientData) {
			setParams({
				do_sample: clientData.do_sample ?? DEFAULT_PARAMS.do_sample,
				temperature: clientData.temperature ?? DEFAULT_PARAMS.temperature,
				top_p: clientData.top_p ?? DEFAULT_PARAMS.top_p,
				top_k: clientData.top_k ?? DEFAULT_PARAMS.top_k,
				repetition_penalty:
					clientData.repetition_penalty ?? DEFAULT_PARAMS.repetition_penalty,
				max_tokens: clientData.max_tokens ?? DEFAULT_PARAMS.max_tokens,
			});
		}
	}, [clientData]);

	const handleSave = async () => {
		try {
			await updateMutation.mutateAsync({
				clientId,
				...params,
			});
			onSaveSuccess();
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to save generation parameters";
			onSaveError(message);
		}
	};

	return (
		<div className="space-y-6">
			{/* Sampling Strategy Toggle */}
			<div>
				<div className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
					Sampling Strategy
				</div>
				<button
					type="button"
					onClick={() =>
						setParams((prev) => ({ ...prev, do_sample: !prev.do_sample }))
					}
					className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
						params.do_sample ? "bg-[#03f3ef]" : "bg-slate-300 dark:bg-slate-600"
					}`}
					role="switch"
					aria-checked={params.do_sample}
				>
					<span
						className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
							params.do_sample ? "translate-x-6" : "translate-x-1"
						}`}
					/>
				</button>
				<p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
					{params.do_sample
						? "Sampling (creative, varied responses)"
						: "Greedy (deterministic, consistent responses)"}
				</p>
			</div>

			{/* Temperature Slider */}
			<div>
				<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
					Temperature: {params.temperature.toFixed(1)}
				</label>
				<Slider
					value={params.temperature}
					onChange={(value) =>
						setParams((prev) => ({ ...prev, temperature: value }))
					}
					min={0}
					max={2}
					step={0.1}
					disabled={!params.do_sample}
				/>
				<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Lower = more focused, Higher = more creative
				</p>
			</div>

			{/* Top-p Slider */}
			<div>
				<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
					Top-p (Nucleus): {params.top_p.toFixed(2)}
				</label>
				<Slider
					value={params.top_p}
					onChange={(value) => setParams((prev) => ({ ...prev, top_p: value }))}
					min={0}
					max={1}
					step={0.05}
					disabled={!params.do_sample}
				/>
				<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Samples from smallest set of tokens with cumulative probability p
				</p>
			</div>

			{/* Top-k Slider */}
			<div>
				<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
					Top-k: {params.top_k}
				</label>
				<Slider
					value={params.top_k}
					onChange={(value) =>
						setParams((prev) => ({ ...prev, top_k: Math.round(value) }))
					}
					min={1}
					max={100}
					step={1}
					disabled={!params.do_sample}
				/>
				<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Samples from top k most likely tokens
				</p>
			</div>

			{/* Repetition Penalty Slider */}
			<div>
				<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
					Repetition Penalty: {params.repetition_penalty.toFixed(2)}
				</label>
				<Slider
					value={params.repetition_penalty}
					onChange={(value) =>
						setParams((prev) => ({ ...prev, repetition_penalty: value }))
					}
					min={1}
					max={2}
					step={0.05}
				/>
				<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Reduces repetition by penalizing tokens that already appeared (1.0 =
					no penalty, 1.2 = recommended)
				</p>
			</div>

			{/* Max Tokens Slider */}
			<div>
				<label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
					Max Tokens: {params.max_tokens}
				</label>
				<Slider
					value={params.max_tokens}
					onChange={(value) =>
						setParams((prev) => ({ ...prev, max_tokens: Math.round(value) }))
					}
					min={100}
					max={4096}
					step={100}
				/>
				<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
					Maximum length of generated response (100-4096 tokens)
				</p>
			</div>

			{/* Save Button */}
			<div className="pt-4">
				<button
					onClick={handleSave}
					disabled={updateMutation.isPending}
					className="w-full rounded-lg bg-[#03f3ef] px-4 py-2 text-sm font-medium text-white hover:bg-[#19b5b0] disabled:opacity-50 disabled:cursor-not-allowed transition"
				>
					{updateMutation.isPending ? (
						<span className="flex items-center justify-center gap-2">
							<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
									fill="none"
								/>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							Saving...
						</span>
					) : (
						"Save Parameters"
					)}
				</button>
			</div>
		</div>
	);
}
