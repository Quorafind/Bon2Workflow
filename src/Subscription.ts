import { MarkdownPostProcessorContext } from "obsidian";

interface Subscription {
	name: string;
	amount: number;
	currency: "CNY" | "USD";
	startDate: Date;
	subscriptionType: string;
	isLifetime: boolean;
	isYearly: boolean;
	website: string;
}

interface SubscriptionStatus {
	type: "lifetime" | "active" | "expired";
	daysInfo: string;
	daysSinceStart: number;
}

export class SubscriptionTracker {
	private subscriptions: Subscription[] = [];
	private exchangeRate: number = 7.5; // Fixed exchange rate

	parseSubscriptions(rawData: string): void {
		const lines = rawData.trim().split("\n");

		this.subscriptions = lines
			.filter((line) => line.trim().length > 0)
			.map((line) => {
				const parts = line.trim().split(/\s+/);
				const name = parts[0];
				const priceStr = parts[1];
				const startDate = parts[2];
				const subscriptionType = parts[3]; // monthly, yearly, life-time
				const website = parts[4] || "#";

				const currency = priceStr.includes("￥") ? "CNY" : "USD";
				const amount = parseFloat(priceStr.replace(/[￥$]/g, ""));
				const isLifetime = subscriptionType === "life-time";
				const isYearly =
					name.toLowerCase().includes("yearly") ||
					subscriptionType === "yearly";

				return {
					name,
					amount,
					currency,
					startDate: new Date(startDate),
					subscriptionType,
					isLifetime,
					isYearly,
					website,
				};
			});
	}

	getSubscriptionStatus(sub: Subscription): SubscriptionStatus {
		if (sub.isLifetime) {
			const now = new Date();
			const daysSinceStart = Math.floor(
				(now.getTime() - sub.startDate.getTime()) /
					(1000 * 60 * 60 * 24)
			);
			return {
				type: "lifetime",
				daysInfo: `${sub.startDate.toLocaleDateString(
					"en-US"
				)} Started`,
				daysSinceStart,
			};
		}

		const now = new Date();
		const daysSinceStart = Math.floor(
			(now.getTime() - sub.startDate.getTime()) / (1000 * 60 * 60 * 24)
		);

		return {
			type: "active",
			daysInfo: `${sub.startDate.toLocaleDateString("en-US")} Started · ${
				sub.isYearly ? "Yearly" : "Monthly"
			}`,
			daysSinceStart,
		};
	}

	calculateTotals(): {
		totalCNY: number;
		totalUSD: number;
		monthlySpentCNY: number;
		monthlySpentUSD: number;
		monthlyExpectedCNY: number;
		monthlyExpectedUSD: number;
	} {
		let totalCNY = 0;
		let totalUSD = 0;
		let monthlySpentCNY = 0;
		let monthlySpentUSD = 0;
		let monthlyExpectedCNY = 0;
		let monthlyExpectedUSD = 0;

		const now = new Date();
		const currentMonth = now.getMonth();

		this.subscriptions.forEach((sub) => {
			const monthsSinceStart = this.getMonthsSinceStart(
				sub.startDate,
				now
			);

			// Calculate total expenditure
			if (sub.isLifetime) {
				// Lifetime subscriptions only count once
				if (sub.currency === "CNY") {
					totalCNY += sub.amount;
					totalUSD += sub.amount / this.exchangeRate;
				} else {
					totalUSD += sub.amount;
					totalCNY += sub.amount * this.exchangeRate;
				}
			} else {
				// Calculate total spent by months or years
				let totalAmount = 0;
				if (sub.isYearly) {
					const yearsSinceStart = Math.floor(monthsSinceStart / 12);
					totalAmount = sub.amount * (yearsSinceStart + 1);
				} else {
					totalAmount = sub.amount * (monthsSinceStart + 1);
				}

				if (sub.currency === "CNY") {
					totalCNY += totalAmount;
					totalUSD += totalAmount / this.exchangeRate;
				} else {
					totalUSD += totalAmount;
					totalCNY += totalAmount * this.exchangeRate;
				}
			}

			// Calculate spent this month (only for non-lifetime subscriptions)
			if (!sub.isLifetime) {
				const now = new Date();
				const currentYear = now.getFullYear();
				const currentMonth = now.getMonth();
				const currentDay = now.getDate();

				const subStartYear = sub.startDate.getFullYear();
				const subStartMonth = sub.startDate.getMonth();
				const subStartDay = sub.startDate.getDate();

				// Calculate the end date of subscription period
				let periodEndDate: Date;
				if (sub.isYearly) {
					// Yearly: from start date to same day next year
					periodEndDate = new Date(
						subStartYear + 1,
						subStartMonth,
						subStartDay
					);
				} else {
					// Monthly: from start date to same day next month
					periodEndDate = new Date(
						subStartYear,
						subStartMonth + 1,
						subStartDay
					);
				}

				// Calculate total days in the period
				const periodTotalDays = Math.ceil(
					(periodEndDate.getTime() - sub.startDate.getTime()) /
						(1000 * 60 * 60 * 24)
				);

				// Calculate this month's start and end date
				const monthStart = new Date(currentYear, currentMonth, 1);
				const monthEnd = new Date(currentYear, currentMonth + 1, 0);

				// Days used in current month (up to today)
				let daysInCurrentMonth = 0;
				const overlapStart = new Date(
					Math.max(sub.startDate.getTime(), monthStart.getTime())
				);
				const overlapEnd = new Date(
					Math.min(
						periodEndDate.getTime() - 1, // Exclude end day
						Math.min(monthEnd.getTime(), now.getTime())
					)
				);

				if (overlapEnd >= overlapStart) {
					daysInCurrentMonth =
						Math.ceil(
							(overlapEnd.getTime() - overlapStart.getTime()) /
								(1000 * 60 * 60 * 24)
						) + 1; // +1 to include both start and end dates
				}

				// Days expected to be used in current month (full month)
				let daysExpectedInCurrentMonth = 0;
				const expectedOverlapStart = new Date(
					Math.max(sub.startDate.getTime(), monthStart.getTime())
				);
				const expectedOverlapEnd = new Date(
					Math.min(periodEndDate.getTime() - 1, monthEnd.getTime())
				);

				if (expectedOverlapEnd >= expectedOverlapStart) {
					daysExpectedInCurrentMonth =
						Math.ceil(
							(expectedOverlapEnd.getTime() -
								expectedOverlapStart.getTime()) /
								(1000 * 60 * 60 * 24)
						) + 1; // +1 to include both start and end dates
				}

				// Prorate by number of days
				if (daysInCurrentMonth > 0 && periodTotalDays > 0) {
					const ratio = daysInCurrentMonth / periodTotalDays;
					const monthlyAmount = sub.amount * ratio;

					if (sub.currency === "CNY") {
						monthlySpentCNY += monthlyAmount;
						monthlySpentUSD += monthlyAmount / this.exchangeRate;
					} else {
						monthlySpentUSD += monthlyAmount;
						monthlySpentCNY += monthlyAmount * this.exchangeRate;
					}
				}

				// Calculate expected spending for this month
				if (daysExpectedInCurrentMonth > 0 && periodTotalDays > 0) {
					const expectedRatio =
						daysExpectedInCurrentMonth / periodTotalDays;
					const monthlyExpectedAmount = sub.amount * expectedRatio;

					if (sub.currency === "CNY") {
						monthlyExpectedCNY += monthlyExpectedAmount;
						monthlyExpectedUSD +=
							monthlyExpectedAmount / this.exchangeRate;
					} else {
						monthlyExpectedUSD += monthlyExpectedAmount;
						monthlyExpectedCNY +=
							monthlyExpectedAmount * this.exchangeRate;
					}
				}
			}
		});

		return {
			totalCNY,
			totalUSD,
			monthlySpentCNY,
			monthlySpentUSD,
			monthlyExpectedCNY,
			monthlyExpectedUSD,
		};
	}

	getMonthsSinceStart(startDate: Date, endDate: Date): number {
		const yearsDiff = endDate.getFullYear() - startDate.getFullYear();
		const monthsDiff = endDate.getMonth() - startDate.getMonth();
		return yearsDiff * 12 + monthsDiff;
	}

	render(containerEl: HTMLElement): void {
		// Create container
		const wrapper = containerEl.createDiv({
			cls: "subscription-tracker-container",
		});

		const tableContainer = wrapper.createDiv({
			cls: "subscription-tracker-table-container",
		});

		const table = tableContainer.createEl("table", {
			cls: "subscription-tracker-table",
		});

		// Create table header
		const thead = table.createEl("thead", {
			cls: "subscription-tracker-thead",
		});
		const headerRow = thead.createEl("tr");
		["Service Name", "Amount", "Subscription Status"].forEach((text) => {
			const th = headerRow.createEl("th", {
				cls: "subscription-tracker-th",
				text: text,
			});
		});

		// Create table body
		const tbody = table.createEl("tbody", {
			cls: "subscription-tracker-tbody",
		});

		if (this.subscriptions.length === 0) {
			const row = tbody.createEl("tr");
			const td = row.createEl("td", {
				cls: "subscription-tracker-td subscription-tracker-loading",
				attr: { colspan: "3" },
				text: "Loading data...",
			});
		} else {
			this.subscriptions.forEach((sub) => {
				const status = this.getSubscriptionStatus(sub);
				const row = tbody.createEl("tr");

				// Service Name
				const nameCell = row.createEl("td", {
					cls: "subscription-tracker-td",
				});
				const nameLink = nameCell.createEl("a", {
					cls: "subscription-tracker-service-name",
					href: sub.website,
					attr: { target: "_blank" },
					text: sub.name,
				});

				// Amount
				const priceCell = row.createEl("td", {
					cls: "subscription-tracker-td",
				});
				const priceDiv = priceCell.createDiv({
					cls: "subscription-tracker-price",
					text: `${
						sub.currency === "CNY" ? "¥" : "$"
					}${sub.amount.toFixed(2)}`,
				});

				// Only show RMB conversion for USD
				if (sub.currency === "USD") {
					priceCell.createDiv({
						cls: "subscription-tracker-price-converted",
						text: `≈ ¥${(sub.amount * this.exchangeRate).toFixed(
							2
						)}`,
					});
				}

				// Subscription Status
				const statusCell = row.createEl("td", {
					cls: "subscription-tracker-td",
				});
				const statusDiv = statusCell.createDiv({
					cls: `subscription-tracker-subscription-type subscription-tracker-${status.type}`,
					text:
						status.type === "lifetime"
							? "Lifetime"
							: status.type === "active"
							? "Active"
							: "Expired",
				});

				statusCell.createDiv({
					cls: "subscription-tracker-days-info",
					text: status.daysInfo,
				});
			});
		}

		// Create table footer
		const footer = tableContainer.createDiv({
			cls: "subscription-tracker-table-footer",
		});

		const { totalCNY, totalUSD, monthlySpentCNY, monthlyExpectedCNY } =
			this.calculateTotals();

		// Calculate days in current month
		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth();
		const daysInCurrentMonth = new Date(
			currentYear,
			currentMonth + 1,
			0
		).getDate();

		// Calculate daily expected spending
		const dailyExpectedCNY =
			daysInCurrentMonth > 0
				? monthlyExpectedCNY / daysInCurrentMonth
				: 0;

		const footerLeft = footer.createDiv({
			cls: "subscription-tracker-footer-left",
		});
		footerLeft.createSpan({ text: "Total" });
		footerLeft.createSpan({
			cls: "subscription-tracker-footer-amount",
			text: `¥${totalCNY.toFixed(2)}`,
		});

		const footerRight = footer.createDiv({
			cls: "subscription-tracker-footer-right",
		});
		footerRight.createSpan({ text: "Spent This Month" });
		footerRight.createSpan({
			cls: "subscription-tracker-footer-amount",
			text: `¥${monthlySpentCNY.toFixed(2)}`,
		});
		footerRight.createSpan({
			cls: "subscription-tracker-footer-separator",
			text: "|",
		});
		footerRight.createSpan({ text: "Expected This Month" });
		footerRight.createSpan({
			cls: "subscription-tracker-footer-amount",
			text: `¥${monthlyExpectedCNY.toFixed(2)}`,
		});
		footerRight.createSpan({
			cls: "subscription-tracker-footer-separator",
			text: "|",
		});
		footerRight.createSpan({ text: "Expected Daily" });
		footerRight.createSpan({
			cls: "subscription-tracker-footer-amount",
			text: `¥${dailyExpectedCNY.toFixed(2)}`,
		});
	}
}

export function renderSubscription(
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext
): void {
	el.empty();

	const tracker = new SubscriptionTracker();
	tracker.parseSubscriptions(source);
	tracker.render(el);
}
