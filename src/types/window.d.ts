import type { TypstAPIInterface } from "../typst/types";

/**
 * 全局 window 对象扩展
 * 为 Bon-Workflow 插件提供的全局 API
 */
declare global {
	interface Window {
		/**
		 * Bon-Workflow 插件的全局 API 命名空间
		 */
		bon?: {
			/**
			 * Typst 转换 API
			 * @see TypstAPIInterface
			 */
			typst?: TypstAPIInterface;
		};
	}
}

// 确保此文件被视为模块
export {};
