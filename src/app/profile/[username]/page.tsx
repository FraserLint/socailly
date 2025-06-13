import {getProfileByUsername, getUserLikedPosts, getUserPosts, isFollowing} from "@/actions/profile.action";
import {notFound} from "next/navigation";
import ProfilePageClient from "./ProfilePageClient";
import {useRouter} from "next/router";

export async function generateMetadata() {
    const router = useRouter();
    const user = await getProfileByUsername(router.query.username as string);

    if (!user) { // @ts-ignore
        return;
    }

    return {
        title: `${user.name ?? user.username}`,
        description: user.bio || `Check out ${user.username}'s profile`
    }
}

async function ProfilePageServer() {
    const router = useRouter();
    const user = await getProfileByUsername(router.query.username as string);

    if (!user) notFound();

    const [posts, likedPosts, isCurrentUserFollowing] = await Promise.all([
        getUserPosts(user.id),
        getUserLikedPosts(user.id),
        isFollowing(user.id),
    ])

    return <ProfilePageClient
        user={user}
        posts={posts}
        likedPosts={likedPosts}
        isFollowing={isCurrentUserFollowing}
    />
}
export default ProfilePageServer;