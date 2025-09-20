import EmptyState from "@/components/ui/empty-state";
import {
  deleteProjectById,
  duplicateProjectById,
  editProjectById,
  getAllPlaygroundForUser,
} from "@/features/dashboard/actions";
import AddNewButton from "@/features/dashboard/components/add-new-button";
import AddRepoButton from "@/features/dashboard/components/add-repo-button";
import ProjectTable from "@/features/dashboard/components/project-table";

const Page = async () => {
  const playgrounds = await getAllPlaygroundForUser().catch((error) => {
    console.error("Failed to load playgrounds", error);
    return [];
  });

  const safePlaygrounds = Array.isArray(playgrounds) ? playgrounds : [];

  return (
    <div className="flex flex-col justify-start items-center min-h-screen mx-auto max-w-7xl px-4 py-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <AddNewButton />
        <AddRepoButton />
      </div>

      <div className="mt-10 flex flex-col justify-center items-center w-full">
        {safePlaygrounds.length === 0 ? (
          <EmptyState
            title="No projects Found"
            description="Create a new project to get started"
            imageSrc="/empty-state.svg"
          />
        ) : (
          <ProjectTable
            //  @ts-ignore
            // TODO : NEED TO UPDATE TYPES OF THE PLAYGROUND
            projects={safePlaygrounds}
            onDeleteProject={deleteProjectById}
            onUpdateProject={editProjectById}
            onDuplicateProject={duplicateProjectById}
          />
        )}
      </div>
    </div>
  );
};

export default Page;
