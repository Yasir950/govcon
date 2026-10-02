-- members.cred_points was seeded with arbitrary marketing numbers
-- (4892, 4315, 3740, 3128, 2907) when this table was first created — there
-- is no real mechanism yet that earns these points, so displaying the fake
-- seed numbers is misleading in the same way posts.votes was. Reset to 0
-- until a real points system exists.
update public.members set cred_points = 0;
