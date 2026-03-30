import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

type UserProfile = {
  role?: string | null;
  email?: string | null;
  id?: string | null;
};

type DealerOnboardingProfile = {
  onboarding_status?: string | null;
  dealer_account_status?: string | null;
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const roleDashboards: Record<string, string> = {
    ceo: "/ceo",
    business_head: "/business-head",
    sales_head: "/sales-head",
    sales_manager: "/sales-manager",
    sales_executive: "/sales-executive",
    finance_controller: "/finance-controller",
    inventory_manager: "/inventory-manager",
    service_engineer: "/service-engineer",
    sales_order_manager: "/sales-order-manager",
    dealer: "/dealer-portal",
    admin: "/admin",
  };

  const isPublicRoute =
    path === "/login" ||
    path === "/logout" ||
    path.startsWith("/api") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  const isProtectedRoute =
    Object.values(roleDashboards).some(
      (dashboardPath) =>
        path === dashboardPath || path.startsWith(`${dashboardPath}/`)
    ) ||
    path.startsWith("/inventory") ||
    path.startsWith("/product-catalog") ||
    path.startsWith("/oem-onboarding") ||
    path.startsWith("/deals") ||
    path.startsWith("/leads") ||
    path.startsWith("/approvals") ||
    path.startsWith("/orders") ||
    path.startsWith("/provisions") ||
    path.startsWith("/disputes") ||
    path === "/" ||
    path === "/dashboard";

  if (!user) {
    if (isPublicRoute) return response;

    if (isProtectedRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    return response;
  }

  let profile: UserProfile | null = null;

  const { data: profileById } = await supabase
    .from("users")
    .select("role,email,id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileById) {
    profile = profileById;
  } else if (user.email) {
    const { data: profileByEmail } = await supabase
      .from("users")
      .select("role,email,id")
      .eq("email", user.email)
      .maybeSingle();

    if (profileByEmail) {
      profile = profileByEmail;
    }
  }

  const rawRole = profile?.role || "user";
  const role = rawRole.toLowerCase();
  const myDashboard = roleDashboards[role] || "/";

  console.log("[MIDDLEWARE] Auth user:", {
    authUserId: user.id,
    authEmail: user.email,
    resolvedRole: role,
    dashboard: myDashboard,
    path,
  });

  if (path === "/login" || path === "/" || path === "/dashboard") {
    if (myDashboard !== "/") {
      return NextResponse.redirect(new URL(myDashboard, request.url));
    }
    return response;
  }

  // Explicit shared access for dealer verification pages
  if (path === "/admin/dealer-verification" || path.startsWith("/admin/dealer-verification/")) {
    if (["admin", "sales_head", "business_head", "ceo"].includes(role)) {
      return response;
    }
    return NextResponse.redirect(new URL(myDashboard, request.url));
  }

  const matchedRole = Object.entries(roleDashboards).find(
    ([, dashboardPath]) =>
      path === dashboardPath || path.startsWith(`${dashboardPath}/`)
  )?.[0];

  if (matchedRole && matchedRole !== role && role !== "ceo") {
    return NextResponse.redirect(new URL(myDashboard, request.url));
  }

  // Dealer-specific gating
  if (role === "dealer") {
    const { data: onboarding } = await supabase
      .from("dealer_onboarding_applications")
      .select("onboarding_status,dealer_account_status")
      .eq("dealer_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dealerProfile = onboarding as DealerOnboardingProfile | null;

    const onboardingStatus = (
      dealerProfile?.onboarding_status || "draft"
    ).toLowerCase();

    const dealerAccountStatus = (
      dealerProfile?.dealer_account_status || ""
    ).toLowerCase();

    const isDealerPortalRoute = path.startsWith("/dealer-portal");
    const isDealerOnboardingRoute =
      path.startsWith("/dealer-onboarding") ||
      path.startsWith("/dealer-portal/onboarding-status");

    if (isDealerPortalRoute) {
      const isApprovedAndActive =
        onboardingStatus === "approved" && dealerAccountStatus === "active";

      if (isApprovedAndActive) {
        return response;
      }

      const url = request.nextUrl.clone();

      if (
        onboardingStatus === "draft" ||
        onboardingStatus === "in_progress" ||
        onboardingStatus === ""
      ) {
        url.pathname = "/dealer-onboarding";
        return NextResponse.redirect(url);
      }

      if (
        onboardingStatus === "submitted" ||
        onboardingStatus === "pending_sales_head" ||
        onboardingStatus === "under_review" ||
        onboardingStatus === "agreement_in_progress" ||
        onboardingStatus === "agreement_completed" ||
        onboardingStatus === "correction_requested" ||
        onboardingStatus === "action_needed" ||
        onboardingStatus === "rejected"
      ) {
        url.pathname = "/dealer-portal/onboarding-status";
        return NextResponse.redirect(url);
      }

      url.pathname = "/dealer-onboarding";
      return NextResponse.redirect(url);
    }

    if (isDealerOnboardingRoute) {
      return response;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};