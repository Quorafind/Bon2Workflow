import { Platform } from "obsidian";
import { TypstNotFoundError, TypstInvalidPathError } from "./typstErrors";

// Dynamic imports for Node.js modules (only available on desktop)
let execAsync: ((command: string, options?: any) => Promise<any>) | null = null;

// Initialize Node.js modules only on desktop
if (Platform.isDesktopApp) {
	try {
		const { exec } = require("child_process");
		const { promisify } = require("util");
		execAsync = promisify(exec);
	} catch (error) {
		console.error("Failed to load Node.js modules:", error);
	}
}

interface TypstDetectionResult {
	path: string;
	version: string;
	method: "custom" | "system" | "detected";
}

/**
 * Typst CLI path resolver
 * Priority: custom path > cached path > system PATH > common paths search
 */
export class TypstPathResolver {
	private cachedResult: TypstDetectionResult | null = null;

	/**
	 * Resolve Typst CLI path
	 * @param customPath User-defined custom path (optional)
	 * @returns Typst executable file path
	 */
	async resolveTypstPath(customPath?: string): Promise<string> {
		// Check if running on desktop (CLI not available on mobile)
		if (!Platform.isDesktopApp) {
			throw new TypstNotFoundError([
				"Typst CLI compilation is only available on desktop",
				"Use WASM preview mode on mobile devices",
			]);
		}

		if (!execAsync) {
			throw new TypstNotFoundError([
				"Node.js modules not available",
				"Cannot execute CLI commands",
			]);
		}

		try {
			// Priority 1: User custom path
			if (customPath) {
				const result = await this.validateCustomPath(customPath);
				this.cachedResult = result;
				return result.path;
			}

			// Priority 2: Use cached result
			if (this.cachedResult) {
				return this.cachedResult.path;
			}

			// Priority 3: System PATH (for Windows/Linux or terminal launch)
			const systemResult = await this.detectInSystemPath();
			if (systemResult) {
				this.cachedResult = systemResult;
				return systemResult.path;
			}

			// Priority 4: Search common installation paths (Mac specific)
			const detectedResult = await this.searchCommonPaths();
			if (detectedResult) {
				this.cachedResult = detectedResult;
				return detectedResult.path;
			}

			// All methods failed, throw error with suggestions
			throw new TypstNotFoundError(this.getSuggestions());
		} catch (error) {
			if (
				error instanceof TypstNotFoundError ||
				error instanceof TypstInvalidPathError
			) {
				throw error;
			}
			throw new TypstNotFoundError(this.getSuggestions());
		}
	}

	/**
	 * Get detection result (for settings UI display)
	 */
	async getDetectionResult(
		customPath?: string,
	): Promise<TypstDetectionResult | null> {
		try {
			await this.resolveTypstPath(customPath);
			return this.cachedResult;
		} catch {
			return null;
		}
	}

	/**
	 * Clear cache (use after settings change)
	 */
	clearCache(): void {
		this.cachedResult = null;
	}

	/**
	 * Validate custom path
	 */
	private async validateCustomPath(
		path: string,
	): Promise<TypstDetectionResult> {
		if (!execAsync) {
			throw new TypstInvalidPathError(path, "CLI execution not available");
		}

		const expandedPath = this.expandHomePath(path);

		try {
			const { stdout } = await execAsync(`"${expandedPath}" --version`, {
				timeout: 5000,
			});
			const version = stdout.trim();
			return {
				path: expandedPath,
				version,
				method: "custom",
			};
		} catch (error: any) {
			throw new TypstInvalidPathError(
				path,
				error.message || "Failed to execute command",
			);
		}
	}

	/**
	 * Detect typst in system PATH
	 */
	private async detectInSystemPath(): Promise<TypstDetectionResult | null> {
		if (!execAsync) return null;

		try {
			const { stdout } = await execAsync("typst --version", {
				timeout: 5000,
			});
			const version = stdout.trim();
			return {
				path: "typst",
				version,
				method: "system",
			};
		} catch {
			return null;
		}
	}

	/**
	 * Search common installation paths
	 */
	private async searchCommonPaths(): Promise<TypstDetectionResult | null> {
		if (!execAsync) return null;

		const commonPaths = this.getCommonPaths();

		for (const path of commonPaths) {
			const expandedPath = this.expandHomePath(path);
			try {
				const { stdout } = await execAsync(
					`"${expandedPath}" --version`,
					{
						timeout: 5000,
					},
				);
				const version = stdout.trim();
				return {
					path: expandedPath,
					version,
					method: "detected",
				};
			} catch {
				// Continue to next path
				continue;
			}
		}

		return null;
	}

	/**
	 * Get platform-specific common paths
	 */
	private getCommonPaths(): string[] {
		// Only call process.platform on desktop
		if (!Platform.isDesktopApp) {
			return [];
		}

		const platform = process.platform;

		if (platform === "darwin") {
			// macOS
			return [
				"/opt/homebrew/bin/typst", // Apple Silicon Homebrew
				"/usr/local/bin/typst", // Intel Homebrew
				"~/.cargo/bin/typst", // Cargo
				"/usr/bin/typst", // System install
			];
		} else if (platform === "linux") {
			// Linux
			return [
				"/usr/local/bin/typst",
				"/usr/bin/typst",
				"~/.cargo/bin/typst",
			];
		} else if (platform === "win32") {
			// Windows
			return [
				"C:\\Program Files\\Typst\\typst.exe",
				`${process.env.USERPROFILE}\\.cargo\\bin\\typst.exe`,
			];
		}

		return [];
	}

	/**
	 * Expand ~ to user home directory
	 */
	private expandHomePath(path: string): string {
		if (path.startsWith("~/") || path === "~") {
			const home = process.env.HOME || process.env.USERPROFILE || "";
			return path.replace(/^~/, home);
		}
		return path;
	}

	/**
	 * Get installation suggestions
	 */
	private getSuggestions(): string[] {
		if (!Platform.isDesktopApp) {
			return ["CLI compilation is only available on desktop"];
		}

		const platform = process.platform;
		const suggestions: string[] = [];

		if (platform === "darwin") {
			suggestions.push(
				"Install via Homebrew: brew install typst",
				"Install via Cargo: cargo install typst-cli",
				"Download from: https://github.com/typst/typst/releases",
				"Or set custom path in plugin settings",
			);
		} else if (platform === "linux") {
			suggestions.push(
				"Install via package manager or Cargo: cargo install typst-cli",
				"Download from: https://github.com/typst/typst/releases",
				"Or set custom path in plugin settings",
			);
		} else if (platform === "win32") {
			suggestions.push(
				"Install via Cargo: cargo install typst-cli",
				"Download from: https://github.com/typst/typst/releases",
				"Or set custom path in plugin settings",
			);
		}

		return suggestions;
	}
}
