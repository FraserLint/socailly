"use server";

import {auth, currentUser} from "@clerk/nextjs/server";
import prisma from "@/lib/prisma";
import {revalidatePath} from "next/cache";

export async function syncUser() {
    try {
        const {userId} = await auth();
        const user = await currentUser();

        if (!userId || !user) {
            return;
        }

        const existingUser = await prisma.user.findUnique({where: {clerkId: userId}});

        if (existingUser) return existingUser;


        const dbUser = await prisma.user.create({
            data: {
                clerkId: userId,
                name: `${user.firstName || ""} ${user.lastName || ""}`,
                username: user.username ?? user.emailAddresses[0].emailAddress.split("@")[0], // Fallback to email prefix if username is not set
                email: user.emailAddresses[0].emailAddress,
                image: user.imageUrl,
            }
        })

        return dbUser;

    } catch (error) {
        console.log("Error in syncUser", error);
    }
}

export async function getUserByClerkId(clerkId: string) {
    return prisma.user.findUnique({
        where: {
            clerkId
        },
        include: {
            _count: {
                select: {
                    followers: true,
                    following: true,
                    posts: true
                }
            }
        }
    });
}

export async function getDbUserId() {
    const {userId: clerkId} = await auth();
    if (!clerkId) return null;

    const user = await getUserByClerkId(clerkId);

    if (!user) throw new Error("User not found");

    return user.id;
}

export async function getRandomUsers() {
    try {
        const userId = await getDbUserId();

        if (!userId) return [];

        // Get 3 random users excluding the current user and those the user already follows
        const getRandomUsers = await prisma.user.findMany({
            where: {
                AND: [
                    { NOT: { id: userId } },
                    {
                        NOT: {
                            followers: {
                                some: {
                                    followerId: userId,
                                },
                            },
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                username: true,
                image: true,
                _count: {
                    select: {
                        followers: true,
                    },
                },
            },
            take: 3,
        });

        return getRandomUsers;

    } catch (error) {
        console.log("Error fetching random users", error);
        return [];
    }
}

export async function toggleFollow(targetUserId: string) {
    try {
        const userId = await getDbUserId();

        if (!userId) return;

        if (userId === targetUserId) throw new Error("You cannot follow yourself");

        const existingFollow = await prisma.follows.findUnique({
            where: {
                followerId_followingId: {
                    followerId: userId,
                    followingId: targetUserId,
                },
            }
        });

        if (existingFollow) {
            // Unfollow the user
            await prisma.follows.delete({
                where: {
                    followerId_followingId: {
                        followerId: userId,
                        followingId: targetUserId,
                    },
                }
            });
        } else {
            // Follow the user
            await prisma.$transaction([
                prisma.follows.create({
                    data: {
                        followerId: userId,
                        followingId: targetUserId,
                    }
                }),
                prisma.notification.create({
                    data: {
                        type: "FOLLOW",
                        userId: targetUserId, // User being followed
                        creatorId: userId, // Follower
                    }
                })
            ])
        }

        revalidatePath("/")
        return { sucess: true };

    } catch (error) {
        console.log("Error in toggleFollow", error);
        return { sucess: false, error: "Error toggling follow" };
    }
}